from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Mapping

from .factor_space import (
    BASELINE_CONFIG,
    FACTOR_NAMES,
    FACTOR_SPACE_VERSION,
    FACTOR_VALUES,
    normalize_factor_config,
)

APP_INFERENCE_FEATURE_SCHEMA_VERSION = "app_inference_features.v1"
APP_SIX_FACTOR_DECISION_SCHEMA_VERSION = "app_six_factor_decision.v1"
EXPERIMENTAL_SIX_FACTOR_POLICY_ENV = "EDUAI_EXPERIMENTAL_SIX_FACTOR_POLICY"

DECISION_SOURCES = ("ml_policy", "heuristic_baseline", "static_fallback")
OUTCOME_FIELD_NAMES = {
    "pre_score",
    "post_score",
    "max_score",
    "next_step_success",
    "normalized_learning_gain",
    "outcome_available",
    "outcome",
}


def _as_mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _string_or_none(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _enum_or_none(value: Any, allowed: tuple[str, ...]) -> str | None:
    normalized = _string_or_none(value)
    return normalized if normalized in allowed else None


def _non_negative_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return default
    return max(0, int(value))


def _nullable_rate(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return None
    return max(0.0, min(1.0, float(value)))


def _nullable_non_negative_number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return None
    return max(0.0, float(value))


def _iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _ensure_no_outcome_fields(label: str, payload: Mapping[str, Any]) -> None:
    forbidden = sorted(set(payload.keys()) & OUTCOME_FIELD_NAMES)
    if forbidden:
        raise ValueError(f"{label} contains outcome fields: {forbidden}")


def _normalize_surface(value: Any) -> str:
    return _enum_or_none(value, ("test", "chat", "learning_content", "unknown")) or "unknown"


def _normalize_task_type(value: Any) -> str:
    return _enum_or_none(value, ("quiz", "exam", "practice", "chat", "unknown")) or "unknown"


def _normalize_current_config(value: Any) -> dict[str, str] | None:
    if not isinstance(value, Mapping):
        return None
    try:
        return normalize_factor_config(value)
    except ValueError:
        return None


def _compatibility_block() -> dict[str, Any]:
    return {
        "factor_space_version": FACTOR_SPACE_VERSION,
        "contract_version": APP_SIX_FACTOR_DECISION_SCHEMA_VERSION,
        "app_runtime_default_enabled": False,
        "internal_policy_shape": "candidate_outcome_scorer",
    }


def build_app_inference_features_v1(context: Mapping[str, Any]) -> dict[str, Any]:
    ids = _as_mapping(context.get("ids"))
    raw_features = _as_mapping(context.get("pre_decision_features"))
    declared = _as_mapping(context.get("declared_preferences"))
    runtime = _as_mapping(context.get("runtime_context"))
    app_context = _as_mapping(context.get("context"))
    previous_config = context.get("current_or_previous_config") or context.get("current_config")
    notes = list(context.get("availability_notes") or [])

    _ensure_no_outcome_fields("context", context)
    _ensure_no_outcome_fields("pre_decision_features", raw_features)

    declared_format = raw_features.get("declared_preference_format", declared.get("presentation_format"))
    if declared_format == "mcq":
        declared_format = None
        notes.append("Current app response_format=mcq is not a six-factor presentation_format.")

    result = {
        "schema_version": APP_INFERENCE_FEATURE_SCHEMA_VERSION,
        "ids": {
            "user_ref": _string_or_none(ids.get("user_ref") or context.get("user_ref")) or "unknown_user",
            "subject_ref": _string_or_none(ids.get("subject_ref") or context.get("subject_ref")),
            "topic_ref": _string_or_none(ids.get("topic_ref") or context.get("topic_ref")),
            "session_ref": _string_or_none(ids.get("session_ref") or context.get("session_ref")),
            "content_event_ref": _string_or_none(ids.get("content_event_ref") or context.get("content_event_ref")),
            "test_event_ref": _string_or_none(ids.get("test_event_ref") or context.get("test_event_ref")),
        },
        "context": {
            "surface": _normalize_surface(app_context.get("surface") or context.get("surface")),
            "task_type": _normalize_task_type(app_context.get("task_type") or context.get("task_type")),
            "subject_title": _string_or_none(app_context.get("subject_title") or context.get("subject_title")),
            "topic_text": _string_or_none(app_context.get("topic_text") or context.get("topic")),
            "section_ref": _string_or_none(app_context.get("section_ref") or context.get("section_ref")),
            "concept_ref": _string_or_none(app_context.get("concept_ref") or context.get("concept_ref")),
            "skill_ref": _string_or_none(app_context.get("skill_ref") or context.get("skill_ref")),
        },
        "pre_decision_features": {
            "prior_attempts_count": _non_negative_int(raw_features.get("prior_attempts_count")),
            "prior_correct_rate": _nullable_rate(raw_features.get("prior_correct_rate")),
            "recent_correct_rate": _nullable_rate(raw_features.get("recent_correct_rate")),
            "recent_attempts_count": _non_negative_int(raw_features.get("recent_attempts_count")),
            "topic_seen_count": _non_negative_int(raw_features.get("topic_seen_count")),
            "minutes_since_last_activity": _nullable_non_negative_number(
                raw_features.get("minutes_since_last_activity")
            ),
            "session_position": _non_negative_int(raw_features.get("session_position")),
            "declared_preference_difficulty": _enum_or_none(
                raw_features.get("declared_preference_difficulty", declared.get("difficulty_target")),
                FACTOR_VALUES["difficulty"],
            ),
            "declared_preference_depth": _enum_or_none(
                raw_features.get("declared_preference_depth", declared.get("depth")),
                FACTOR_VALUES["depth"],
            ),
            "declared_preference_format": _enum_or_none(declared_format, FACTOR_VALUES["presentation_format"]),
        },
        "current_or_previous_config": _normalize_current_config(previous_config),
        "runtime_context": {
            "policy_id": _string_or_none(runtime.get("policy_id") or context.get("policy_id")),
            "model_version": _string_or_none(runtime.get("model_version") or context.get("model_version")),
            "backend_kind": _string_or_none(runtime.get("backend_kind") or context.get("backend_kind")),
            "artifact_path": _string_or_none(runtime.get("artifact_path") or context.get("artifact_path")),
            "fallback_available": runtime.get("fallback_available") is not False,
            "experimental_enabled": runtime.get("experimental_enabled") is True,
        },
        "leakage_guard": {
            "features_cutoff_at": _string_or_none(context.get("features_cutoff_at")) or _iso_now(),
            "uses_only_pre_decision_data": True,
            "forbidden_outcome_fields_absent": True,
            "notes": "Built from app-compatible pre-decision fields only.",
        },
        "availability_notes": notes,
    }
    return result


def create_static_six_factor_fallback(warnings: list[str] | None = None) -> dict[str, Any]:
    return {
        "schema_version": APP_SIX_FACTOR_DECISION_SCHEMA_VERSION,
        **BASELINE_CONFIG,
        "decision_source": "static_fallback",
        "model_version": None,
        "policy_id": "six_factor_static_fallback_v1",
        "artifact_path": None,
        "fallback_used": True,
        "candidate_count": None,
        "confidence": 0.0,
        "warnings": warnings
        or ["Static fallback preserves the app-facing six-factor contract without activating ML serving."],
        "compatibility": _compatibility_block(),
    }


def create_heuristic_six_factor_fallback_from_current_two_factor_runtime(
    current_runtime_decision: Mapping[str, Any],
) -> dict[str, Any]:
    difficulty = _enum_or_none(current_runtime_decision.get("difficulty"), FACTOR_VALUES["difficulty"]) or BASELINE_CONFIG[
        "difficulty"
    ]
    depth = _enum_or_none(current_runtime_decision.get("depth"), FACTOR_VALUES["depth"]) or BASELINE_CONFIG["depth"]
    rendering = _as_mapping(current_runtime_decision.get("renderingDecision"))
    surface = _normalize_surface(current_runtime_decision.get("surface"))

    support_level = {
        "brief": "minimal",
        "standard": "guided",
        "detailed": "scaffolded",
    }[depth]
    presentation_format = "qa" if surface == "chat" else "structured_list"
    if rendering.get("formattingHint") == "scaffolded" or depth == "detailed":
        presentation_format = "step_by_step"
    examples_level = "multiple" if depth == "detailed" else "single"
    terminology_level = {
        "easy": "simple",
        "medium": "balanced",
        "hard": "technical",
    }[difficulty]

    return {
        "schema_version": APP_SIX_FACTOR_DECISION_SCHEMA_VERSION,
        "difficulty": difficulty,
        "depth": depth,
        "support_level": support_level,
        "presentation_format": presentation_format,
        "examples_level": examples_level,
        "terminology_level": terminology_level,
        "decision_source": "heuristic_baseline",
        "model_version": None,
        "policy_id": "six_factor_two_factor_bridge_v1",
        "artifact_path": None,
        "fallback_used": True,
        "candidate_count": None,
        "confidence": 0.0,
        "warnings": [
            "Derived from current two-factor runtime; this is a bridge baseline, not ML policy output.",
            "Support, presentation, examples, and terminology are materialization defaults until six-factor rendering is implemented.",
        ],
        "compatibility": _compatibility_block(),
    }


def validate_six_factor_decision(decision: Mapping[str, Any]) -> bool:
    normalize_factor_config({factor: decision.get(factor) for factor in FACTOR_NAMES})
    if decision.get("schema_version") != APP_SIX_FACTOR_DECISION_SCHEMA_VERSION:
        raise ValueError("Invalid app six-factor decision schema_version")
    if decision.get("decision_source") not in DECISION_SOURCES:
        raise ValueError("Invalid decision_source")
    if not isinstance(decision.get("fallback_used"), bool):
        raise ValueError("fallback_used must be boolean")
    candidate_count = decision.get("candidate_count")
    if candidate_count is not None and (not isinstance(candidate_count, int) or candidate_count < 1):
        raise ValueError("candidate_count must be null or positive integer")
    confidence = decision.get("confidence")
    if confidence is not None and (
        not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1
    ):
        raise ValueError("confidence must be null or 0..1")
    return True


def map_six_factor_decision_to_render_policy(decision: Mapping[str, Any]) -> dict[str, Any]:
    validate_six_factor_decision(decision)
    config = normalize_factor_config({factor: decision[factor] for factor in FACTOR_NAMES})

    explanation_style = "stepwise"
    if config["depth"] == "brief" and config["support_level"] == "minimal":
        explanation_style = "concise"
    elif config["presentation_format"] == "qa":
        explanation_style = "exploratory"

    return {
        "schema_version": "six_factor_render_policy.v1",
        "legacy_delivery": {
            "difficulty_target": config["difficulty"],
            "depth": config["depth"],
            "tone": "formal",
            "explanation_style": explanation_style,
            "response_format": "mcq",
        },
        "six_factor_prompt_instructions": {
            "difficulty": f"Use {config['difficulty']} pedagogical challenge.",
            "depth": f"Use {config['depth']} explanation depth.",
            "support_level": f"Use {config['support_level']} pedagogical support.",
            "presentation_format": f"Organize content as {config['presentation_format']}.",
            "examples_level": f"Use {config['examples_level']} example density.",
            "terminology_level": f"Use {config['terminology_level']} terminology density.",
        },
        "logging_payload": {
            "six_factor_config": config,
            "decision_source": decision["decision_source"],
            "policy_id": decision.get("policy_id"),
            "model_version": decision.get("model_version"),
            "fallback_used": decision["fallback_used"],
        },
    }


def build_scorer_observation_from_app_features(
    app_features: Mapping[str, Any],
    candidate_config: Mapping[str, Any],
) -> dict[str, Any]:
    config = normalize_factor_config({factor: candidate_config.get(factor) for factor in FACTOR_NAMES})
    pre = _as_mapping(app_features.get("pre_decision_features"))
    ids = _as_mapping(app_features.get("ids"))
    source = "real_user"
    return {
        "ids": {
            "user_ref": ids.get("user_ref") or "unknown_user",
            "subject_ref": ids.get("subject_ref") or "unknown_subject",
            "topic_ref": ids.get("topic_ref") or ids.get("subject_ref") or "unknown_topic",
        },
        "source": {
            "source_kind": source,
        },
        "pre_decision_features": {
            "prior_attempts_count": _non_negative_int(pre.get("prior_attempts_count")),
            "prior_correct_rate": _nullable_rate(pre.get("prior_correct_rate")) or 0.0,
            "recent_correct_rate": _nullable_rate(pre.get("recent_correct_rate")) or 0.0,
            "recent_attempts_count": _non_negative_int(pre.get("recent_attempts_count")),
            "topic_seen_count": _non_negative_int(pre.get("topic_seen_count")),
            "minutes_since_last_activity": _nullable_non_negative_number(
                pre.get("minutes_since_last_activity")
            ),
            "session_position": _non_negative_int(pre.get("session_position")),
            "declared_preference_difficulty": pre.get("declared_preference_difficulty"),
            "declared_preference_depth": pre.get("declared_preference_depth"),
            "declared_preference_format": pre.get("declared_preference_format"),
        },
        "candidate_config": config,
    }


def is_experimental_six_factor_policy_enabled(env: Mapping[str, str] | None = None) -> bool:
    source = env or {}
    raw = source.get(EXPERIMENTAL_SIX_FACTOR_POLICY_ENV, "")
    return raw.strip().lower() in {"1", "true", "yes"}
