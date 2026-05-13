from __future__ import annotations

from hashlib import sha256
from typing import Any, Mapping

from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES, normalize_factor_config
from eduai_ml.guardrails import build_learner_state_safety_profile

FEATURE_SCHEMA_VERSION = "candidate_scorer_features.v1"
SOURCE_KINDS = ("synthetic", "open_dataset", "real_user")
OUTCOME_FIELD_NAMES = {
    "pre_score",
    "post_score",
    "max_score",
    "next_step_success",
    "normalized_learning_gain",
    "outcome_available",
    "outcome",
}


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _scaled_count(value: Any, scale: float) -> float:
    if value is None:
        return 0.0
    return _clamp(float(value) / scale)


def _rate(value: Any) -> float:
    if value is None:
        return 0.0
    return _clamp(float(value))


def _stable_hash_bucket(value: str | None, buckets: int = 16) -> int:
    if not value:
        return 0
    digest = sha256(value.encode("utf-8")).hexdigest()
    return int(digest[:8], 16) % buckets


def _empty_feature_dict() -> dict[str, float]:
    features: dict[str, float] = {
        "prior_attempts_count_scaled": 0.0,
        "prior_correct_rate": 0.0,
        "recent_correct_rate": 0.0,
        "recent_attempts_count_scaled": 0.0,
        "topic_seen_count_scaled": 0.0,
        "minutes_since_last_activity_missing": 0.0,
        "minutes_since_last_activity_scaled": 0.0,
        "session_position_scaled": 0.0,
        "declared_difficulty_missing": 0.0,
        "declared_depth_missing": 0.0,
        "declared_format_missing": 0.0,
        "declared_candidate_difficulty_match": 0.0,
        "declared_candidate_depth_match": 0.0,
        "declared_candidate_format_match": 0.0,
        "unknown_state": 0.0,
        "low_correct_rate": 0.0,
        "high_correct_rate": 0.0,
        "strong_history": 0.0,
        "confident_topic_mastery": 0.0,
        "subject_hash_scaled": 0.0,
        "topic_hash_scaled": 0.0,
    }

    for factor in FACTOR_NAMES:
        values = FACTOR_VALUES[factor]
        if len(values) > 1:
            features[f"candidate_{factor}_ordinal"] = 0.0
        for value in values:
            features[f"candidate_{factor}__{value}"] = 0.0

    for value in FACTOR_VALUES["difficulty"]:
        features[f"declared_difficulty__{value}"] = 0.0
    for value in FACTOR_VALUES["depth"]:
        features[f"declared_depth__{value}"] = 0.0
    for value in FACTOR_VALUES["presentation_format"]:
        features[f"declared_format__{value}"] = 0.0

    for source_kind in SOURCE_KINDS:
        features[f"source_kind__{source_kind}"] = 0.0

    features.update(
        {
            "prior_correct_rate_x_candidate_difficulty_ordinal": 0.0,
            "recent_correct_rate_x_candidate_difficulty_ordinal": 0.0,
            "prior_correct_rate_x_candidate_support_level_ordinal": 0.0,
            "recent_correct_rate_x_candidate_support_level_ordinal": 0.0,
            "topic_seen_count_scaled_x_candidate_examples_level_ordinal": 0.0,
            "recent_attempts_count_scaled_x_candidate_terminology_level_ordinal": 0.0,
            "prior_attempts_count_scaled_x_candidate_depth_ordinal": 0.0,
            "unknown_state_x_candidate_difficulty__hard": 0.0,
            "unknown_state_x_candidate_examples_level__none": 0.0,
            "unknown_state_x_candidate_terminology_level__technical": 0.0,
            "low_correct_rate_x_candidate_difficulty__hard": 0.0,
            "low_correct_rate_x_candidate_support_level__minimal": 0.0,
            "low_correct_rate_x_candidate_examples_level__none": 0.0,
            "high_correct_rate_x_candidate_difficulty__hard": 0.0,
            "high_correct_rate_x_candidate_terminology_level__technical": 0.0,
        }
    )

    return features


FEATURE_NAMES: tuple[str, ...] = tuple(_empty_feature_dict().keys())


def get_feature_names() -> list[str]:
    return list(FEATURE_NAMES)


def extract_features(observation: Mapping[str, Any]) -> dict[str, float]:
    pre_decision_features = observation.get("pre_decision_features")
    if not isinstance(pre_decision_features, Mapping):
        raise ValueError("observation.pre_decision_features must be an object")
    if set(pre_decision_features.keys()) & OUTCOME_FIELD_NAMES:
        raise ValueError("pre_decision_features contains outcome fields")

    candidate_config = normalize_factor_config(observation.get("candidate_config", {}))
    features = _empty_feature_dict()

    minutes_since_last_activity = pre_decision_features.get("minutes_since_last_activity")
    features["prior_attempts_count_scaled"] = _scaled_count(
        pre_decision_features.get("prior_attempts_count"),
        80.0,
    )
    features["prior_correct_rate"] = _rate(pre_decision_features.get("prior_correct_rate"))
    features["recent_correct_rate"] = _rate(pre_decision_features.get("recent_correct_rate"))
    features["recent_attempts_count_scaled"] = _scaled_count(
        pre_decision_features.get("recent_attempts_count"),
        20.0,
    )
    features["topic_seen_count_scaled"] = _scaled_count(
        pre_decision_features.get("topic_seen_count"),
        30.0,
    )
    features["minutes_since_last_activity_missing"] = 1.0 if minutes_since_last_activity is None else 0.0
    features["minutes_since_last_activity_scaled"] = (
        0.0 if minutes_since_last_activity is None else _scaled_count(minutes_since_last_activity, 480.0)
    )
    features["session_position_scaled"] = _scaled_count(
        pre_decision_features.get("session_position"),
        30.0,
    )

    declared_difficulty = pre_decision_features.get("declared_preference_difficulty")
    declared_depth = pre_decision_features.get("declared_preference_depth")
    declared_format = pre_decision_features.get("declared_preference_format")

    features["declared_difficulty_missing"] = 1.0 if declared_difficulty is None else 0.0
    features["declared_depth_missing"] = 1.0 if declared_depth is None else 0.0
    features["declared_format_missing"] = 1.0 if declared_format is None else 0.0
    features["declared_candidate_difficulty_match"] = (
        1.0 if declared_difficulty == candidate_config["difficulty"] else 0.0
    )
    features["declared_candidate_depth_match"] = 1.0 if declared_depth == candidate_config["depth"] else 0.0
    features["declared_candidate_format_match"] = (
        1.0 if declared_format == candidate_config["presentation_format"] else 0.0
    )

    if declared_difficulty in FACTOR_VALUES["difficulty"]:
        features[f"declared_difficulty__{declared_difficulty}"] = 1.0
    if declared_depth in FACTOR_VALUES["depth"]:
        features[f"declared_depth__{declared_depth}"] = 1.0
    if declared_format in FACTOR_VALUES["presentation_format"]:
        features[f"declared_format__{declared_format}"] = 1.0

    for factor in FACTOR_NAMES:
        values = FACTOR_VALUES[factor]
        value = candidate_config[factor]
        if len(values) > 1:
            features[f"candidate_{factor}_ordinal"] = values.index(value) / (len(values) - 1)
        features[f"candidate_{factor}__{value}"] = 1.0

    safety_profile = build_learner_state_safety_profile(pre_decision_features)
    features["unknown_state"] = 1.0 if safety_profile.unknown_state else 0.0
    features["low_correct_rate"] = 1.0 if safety_profile.low_correct_rate else 0.0
    features["high_correct_rate"] = 1.0 if safety_profile.high_correct_rate else 0.0
    features["strong_history"] = 1.0 if safety_profile.strong_history else 0.0
    features["confident_topic_mastery"] = 1.0 if safety_profile.confident_topic_mastery else 0.0

    features["prior_correct_rate_x_candidate_difficulty_ordinal"] = (
        features["prior_correct_rate"] * features["candidate_difficulty_ordinal"]
    )
    features["recent_correct_rate_x_candidate_difficulty_ordinal"] = (
        features["recent_correct_rate"] * features["candidate_difficulty_ordinal"]
    )
    features["prior_correct_rate_x_candidate_support_level_ordinal"] = (
        features["prior_correct_rate"] * features["candidate_support_level_ordinal"]
    )
    features["recent_correct_rate_x_candidate_support_level_ordinal"] = (
        features["recent_correct_rate"] * features["candidate_support_level_ordinal"]
    )
    features["topic_seen_count_scaled_x_candidate_examples_level_ordinal"] = (
        features["topic_seen_count_scaled"] * features["candidate_examples_level_ordinal"]
    )
    features["recent_attempts_count_scaled_x_candidate_terminology_level_ordinal"] = (
        features["recent_attempts_count_scaled"] * features["candidate_terminology_level_ordinal"]
    )
    features["prior_attempts_count_scaled_x_candidate_depth_ordinal"] = (
        features["prior_attempts_count_scaled"] * features["candidate_depth_ordinal"]
    )
    features["unknown_state_x_candidate_difficulty__hard"] = (
        features["unknown_state"] * features["candidate_difficulty__hard"]
    )
    features["unknown_state_x_candidate_examples_level__none"] = (
        features["unknown_state"] * features["candidate_examples_level__none"]
    )
    features["unknown_state_x_candidate_terminology_level__technical"] = (
        features["unknown_state"] * features["candidate_terminology_level__technical"]
    )
    features["low_correct_rate_x_candidate_difficulty__hard"] = (
        features["low_correct_rate"] * features["candidate_difficulty__hard"]
    )
    features["low_correct_rate_x_candidate_support_level__minimal"] = (
        features["low_correct_rate"] * features["candidate_support_level__minimal"]
    )
    features["low_correct_rate_x_candidate_examples_level__none"] = (
        features["low_correct_rate"] * features["candidate_examples_level__none"]
    )
    features["high_correct_rate_x_candidate_difficulty__hard"] = (
        features["high_correct_rate"] * features["candidate_difficulty__hard"]
    )
    features["high_correct_rate_x_candidate_terminology_level__technical"] = (
        features["high_correct_rate"] * features["candidate_terminology_level__technical"]
    )

    ids = observation.get("ids", {})
    if isinstance(ids, Mapping):
        features["subject_hash_scaled"] = _stable_hash_bucket(str(ids.get("subject_ref") or "")) / 15.0
        features["topic_hash_scaled"] = _stable_hash_bucket(str(ids.get("topic_ref") or "")) / 15.0

    source_kind = observation.get("source", {}).get("source_kind")
    if source_kind in SOURCE_KINDS:
        features[f"source_kind__{source_kind}"] = 1.0

    return features


def feature_schema() -> dict[str, Any]:
    return {
        "schema_version": FEATURE_SCHEMA_VERSION,
        "feature_names": get_feature_names(),
        "source_blocks": ["pre_decision_features", "candidate_config", "source.source_kind", "ids.subject_ref", "ids.topic_ref"],
        "forbidden_blocks": ["outcome", "delivered_config"],
        "forbidden_fields": sorted(OUTCOME_FIELD_NAMES),
        "encoding": "stable numeric + one-hot + learner-state/candidate interaction features; no post-decision fields",
    }
