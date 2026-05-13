from __future__ import annotations

from typing import Any, Mapping


class TargetUnavailableError(ValueError):
    pass


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def build_targets(observation: Mapping[str, Any]) -> dict[str, float]:
    outcome = observation.get("outcome")
    if not isinstance(outcome, Mapping):
        raise TargetUnavailableError("outcome block is missing")
    if outcome.get("outcome_available") is not True:
        raise TargetUnavailableError("outcome is unavailable")
    if outcome.get("normalized_learning_gain") is None:
        raise TargetUnavailableError("normalized_learning_gain is missing")
    if outcome.get("next_step_success") is None:
        raise TargetUnavailableError("next_step_success is missing")

    gain = _clamp(float(outcome["normalized_learning_gain"]))
    success = 1.0 if bool(outcome["next_step_success"]) else 0.0
    combined = _clamp(0.75 * gain + 0.25 * success)
    return {
        "expected_learning_gain_proxy": gain,
        "expected_next_step_success": success,
        "combined_outcome_score": combined,
    }


def build_targets_or_none(observation: Mapping[str, Any]) -> dict[str, float] | None:
    try:
        return build_targets(observation)
    except TargetUnavailableError:
        return None
