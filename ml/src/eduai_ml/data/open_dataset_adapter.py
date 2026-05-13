from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from eduai_ml.factor_space import BASELINE_CONFIG, normalize_factor_config
from eduai_ml.validation import validate_training_observation


@dataclass(frozen=True)
class AdapterResult:
    observation: dict[str, Any] | None
    warnings: tuple[str, ...]
    has_six_factor_causal_evidence: bool


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _first(row: Mapping[str, Any], keys: tuple[str, ...], default: Any = None) -> Any:
    for key in keys:
        if key in row:
            return row[key]
    return default


def _as_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    return max(0, int(value))


def _as_rate(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return _clamp(float(value))


def _as_optional_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def map_open_dataset_row_to_pre_decision_features(row: Mapping[str, Any]) -> dict[str, Any]:
    prior_attempts_count = _as_int(
        _first(row, ("prior_attempts_count", "attempts_before", "attempt_count"), 0)
    )
    prior_correct_rate = _as_rate(
        _first(row, ("prior_correct_rate", "historical_correct_rate", "accuracy_before"), 0.0)
    )
    recent_correct_rate = _as_rate(
        _first(row, ("recent_correct_rate", "rolling_correct_rate", "recent_accuracy"), prior_correct_rate)
    )
    recent_attempts_count = _as_int(
        _first(row, ("recent_attempts_count", "rolling_attempt_count"), min(prior_attempts_count, 5))
    )

    return {
        "prior_attempts_count": prior_attempts_count,
        "prior_correct_rate": round(prior_correct_rate, 4),
        "recent_correct_rate": round(recent_correct_rate, 4),
        "recent_attempts_count": recent_attempts_count,
        "topic_seen_count": _as_int(_first(row, ("topic_seen_count", "skill_seen_count"), 0)),
        "minutes_since_last_activity": _first(
            row,
            ("minutes_since_last_activity", "minutes_since_prev", "elapsed_minutes"),
            None,
        ),
        "session_position": _as_int(_first(row, ("session_position", "problem_index"), 0)),
        "declared_preference_difficulty": None,
        "declared_preference_depth": None,
        "declared_preference_format": None,
    }


class OpenDatasetAdapter:
    def __init__(
        self,
        source_name: str,
        source_version: str,
        adapter_version: str = "open_dataset_adapter.v1",
    ) -> None:
        self.source_name = source_name
        self.source_version = source_version
        self.adapter_version = adapter_version

    def build_open_dataset_observation_stub(
        self,
        row: Mapping[str, Any],
        *,
        candidate_config: Mapping[str, Any] | None = None,
        synthetic_candidate_assignment: bool = False,
        observation_id: str | None = None,
    ) -> AdapterResult:
        observed_delivered_config = row.get("delivered_config")
        warnings: list[str] = []

        if observed_delivered_config is not None:
            delivered_config = normalize_factor_config(observed_delivered_config)
            selected_candidate_config = normalize_factor_config(
                candidate_config if candidate_config is not None else delivered_config
            )
            has_evidence = True
        else:
            if candidate_config is None and not synthetic_candidate_assignment:
                return AdapterResult(
                    observation=None,
                    warnings=(
                        "Open dataset row has no delivered_config; provide candidate_config or enable synthetic_candidate_assignment.",
                        "No direct six-factor causal evidence is available.",
                    ),
                    has_six_factor_causal_evidence=False,
                )
            selected_candidate_config = normalize_factor_config(
                candidate_config if candidate_config is not None else BASELINE_CONFIG
            )
            delivered_config = dict(selected_candidate_config)
            warnings.append(
                "delivered_config was assigned for contract compatibility, not observed in the source dataset."
            )
            warnings.append(
                "Open dataset observations are not direct evidence that a specific six-factor configuration caused learning gain."
            )
            has_evidence = False

        decision_created_at = str(
            _first(row, ("decision_created_at", "timestamp", "created_at"), "2026-01-01T00:00:00Z")
        )
        outcome_observed_at = _first(row, ("outcome_observed_at", "answer_timestamp"), None)
        next_step_success = _first(row, ("next_step_success", "correct", "is_correct"), None)
        if next_step_success is not None:
            next_step_success = bool(next_step_success)
        pre_score = _first(row, ("pre_score",), None)
        post_score = _first(row, ("post_score", "score", "correctness"), None)
        max_score = _first(row, ("max_score",), 1.0 if post_score is not None else None)
        normalized_learning_gain = _first(row, ("normalized_learning_gain",), None)
        outcome_available = any(
            value is not None
            for value in (pre_score, post_score, next_step_success, normalized_learning_gain)
        )

        observation = {
            "schema_version": "training_observation.v1",
            "ids": {
                "observation_id": observation_id
                or str(_first(row, ("observation_id", "row_id", "id"), "open_dataset_observation")),
                "user_ref": str(_first(row, ("user_ref", "user_id", "student_id"), "open_user_unknown")),
                "subject_ref": str(_first(row, ("subject_ref", "subject_id", "domain"), "open_subject_unknown")),
                "topic_ref": str(_first(row, ("topic_ref", "skill_id", "topic_id"), "open_topic_unknown")),
                "session_ref": _as_optional_string(_first(row, ("session_ref", "session_id"), None)),
                "content_event_ref": _as_optional_string(_first(row, ("content_event_ref",), None)),
                "test_event_ref": _as_optional_string(_first(row, ("test_event_ref", "attempt_id"), None)),
            },
            "timestamps": {
                "decision_created_at": decision_created_at,
                "outcome_observed_at": outcome_observed_at,
            },
            "source": {
                "source_kind": "open_dataset",
                "source_name": self.source_name,
                "source_version": self.source_version,
                "adapter_version": self.adapter_version,
            },
            "pre_decision_features": map_open_dataset_row_to_pre_decision_features(row),
            "candidate_config": selected_candidate_config,
            "delivered_config": delivered_config,
            "outcome": {
                "pre_score": pre_score,
                "post_score": post_score,
                "max_score": max_score,
                "next_step_success": next_step_success,
                "normalized_learning_gain": normalized_learning_gain,
                "outcome_available": outcome_available,
            },
            "leakage_guard": {
                "features_cutoff_at": decision_created_at,
                "uses_only_pre_decision_data": True,
                "notes": "Open dataset adapter excludes outcome columns from pre_decision_features.",
            },
            "policy_context": {
                "policy_id": None,
                "model_version": None,
                "backend_kind": "open_dataset_adapter",
                "fallback_used": False,
            },
        }

        validate_training_observation(observation)
        return AdapterResult(
            observation=observation,
            warnings=tuple(warnings),
            has_six_factor_causal_evidence=has_evidence,
        )


def build_open_dataset_observation_stub(
    row: Mapping[str, Any],
    *,
    candidate_config: Mapping[str, Any] | None = None,
    synthetic_candidate_assignment: bool = False,
    source_name: str = "generic_open_dataset",
    source_version: str = "unknown",
) -> AdapterResult:
    return OpenDatasetAdapter(source_name, source_version).build_open_dataset_observation_stub(
        row,
        candidate_config=candidate_config,
        synthetic_candidate_assignment=synthetic_candidate_assignment,
    )
