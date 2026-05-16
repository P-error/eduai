from __future__ import annotations

from typing import Any, Mapping


class TargetUnavailableError(ValueError):
    pass


TARGET_SCHEMA_V1 = "outcome_targets.v1_clamped_gain"
TARGET_SCHEMA_V2 = "outcome_targets.v2_signed_gain"
DEFAULT_TARGET_SCHEMA_VERSION = TARGET_SCHEMA_V1


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _read_supervised_outcome(observation: Mapping[str, Any]) -> tuple[float, float]:
    outcome = observation.get("outcome")
    if not isinstance(outcome, Mapping):
        raise TargetUnavailableError("outcome block is missing")
    if outcome.get("outcome_available") is not True:
        raise TargetUnavailableError("outcome is unavailable")
    if outcome.get("normalized_learning_gain") is None:
        raise TargetUnavailableError("normalized_learning_gain is missing")
    if outcome.get("next_step_success") is None:
        raise TargetUnavailableError("next_step_success is missing")

    gain = float(outcome["normalized_learning_gain"])
    success = 1.0 if bool(outcome["next_step_success"]) else 0.0
    return gain, success


def build_targets(
    observation: Mapping[str, Any],
    *,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
) -> dict[str, float]:
    gain_raw, success = _read_supervised_outcome(observation)
    gain = _clamp(gain_raw)
    combined = _clamp(0.75 * gain + 0.25 * success)
    if target_schema_version == TARGET_SCHEMA_V1:
        return {
            "expected_learning_gain_proxy": gain,
            "expected_next_step_success": success,
            "combined_outcome_score": combined,
        }
    if target_schema_version == TARGET_SCHEMA_V2:
        signed_gain = _clamp(gain_raw, -1.0, 1.0)
        signed_gain_for_combined = (signed_gain + 1.0) / 2.0
        signed_aware_combined = _clamp(0.75 * signed_gain_for_combined + 0.25 * success)
        return {
            "expected_learning_gain_proxy": gain,
            "expected_learning_gain_signed": signed_gain,
            "expected_next_step_success": success,
            "combined_outcome_score": signed_aware_combined,
        }
    raise ValueError(f"Unsupported target_schema_version: {target_schema_version}")


def target_schema(target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION) -> dict[str, Any]:
    if target_schema_version == TARGET_SCHEMA_V1:
        return {
            "target_schema_version": TARGET_SCHEMA_V1,
            "primary_target": "expected_learning_gain_proxy",
            "secondary_targets": ["expected_next_step_success", "combined_outcome_score"],
            "formula_description": (
                "expected_learning_gain_proxy = normalized_learning_gain clamped to 0..1; "
                "combined_outcome_score = 0.75 * expected_learning_gain_proxy + "
                "0.25 * expected_next_step_success, clamped to 0..1"
            ),
        }
    if target_schema_version == TARGET_SCHEMA_V2:
        return {
            "target_schema_version": TARGET_SCHEMA_V2,
            "primary_target": "expected_learning_gain_signed",
            "secondary_targets": [
                "expected_learning_gain_proxy",
                "expected_next_step_success",
                "combined_outcome_score",
            ],
            "formula_description": (
                "expected_learning_gain_signed = normalized_learning_gain clamped to -1..1; "
                "expected_learning_gain_proxy remains the legacy 0..1 clamped target; "
                "combined_outcome_score = 0.75 * ((expected_learning_gain_signed + 1) / 2) + "
                "0.25 * expected_next_step_success, clamped to 0..1"
            ),
        }
    raise ValueError(f"Unsupported target_schema_version: {target_schema_version}")


def build_signed_targets(observation: Mapping[str, Any]) -> dict[str, float]:
    return build_targets(observation, target_schema_version=TARGET_SCHEMA_V2)


def build_clamped_targets(observation: Mapping[str, Any]) -> dict[str, float]:
    return {
        **build_targets(observation, target_schema_version=TARGET_SCHEMA_V1),
    }


def build_targets_or_none(
    observation: Mapping[str, Any],
    *,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
) -> dict[str, float] | None:
    try:
        return build_targets(observation, target_schema_version=target_schema_version)
    except TargetUnavailableError:
        return None
