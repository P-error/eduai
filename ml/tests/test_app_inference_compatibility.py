from __future__ import annotations

import pytest

from eduai_ml.app_inference_compatibility import (
    APP_SIX_FACTOR_DECISION_SCHEMA_VERSION,
    EXPERIMENTAL_SIX_FACTOR_POLICY_ENV,
    build_app_inference_features_v1,
    build_scorer_observation_from_app_features,
    create_heuristic_six_factor_fallback_from_current_two_factor_runtime,
    create_static_six_factor_fallback,
    is_experimental_six_factor_policy_enabled,
    map_six_factor_decision_to_render_policy,
    validate_six_factor_decision,
)
from eduai_ml.contracts import (
    load_app_inference_features_example,
    load_app_six_factor_decision_example,
)
from eduai_ml.factor_space import FACTOR_NAMES
from eduai_ml.training.feature_extraction import extract_features
from eduai_ml.validation import validate_app_inference_features, validate_app_six_factor_decision


def test_app_inference_schema_accepts_examples() -> None:
    validate_app_inference_features(load_app_inference_features_example())
    validate_app_six_factor_decision(load_app_six_factor_decision_example())


def test_six_factor_decision_validation_accepts_all_six_factors() -> None:
    decision = create_static_six_factor_fallback()

    assert validate_six_factor_decision(decision) is True
    assert decision["schema_version"] == APP_SIX_FACTOR_DECISION_SCHEMA_VERSION
    assert all(factor in decision for factor in FACTOR_NAMES)


def test_static_fallback_returns_valid_six_factor_config() -> None:
    decision = create_static_six_factor_fallback()

    validate_app_six_factor_decision(decision)
    assert decision["decision_source"] == "static_fallback"
    assert decision["fallback_used"] is True


def test_render_mapping_covers_all_six_factors() -> None:
    decision = create_static_six_factor_fallback()
    render_policy = map_six_factor_decision_to_render_policy(decision)

    prompt_instructions = render_policy["six_factor_prompt_instructions"]
    assert set(prompt_instructions.keys()) == set(FACTOR_NAMES)
    assert set(render_policy["logging_payload"]["six_factor_config"].keys()) == set(FACTOR_NAMES)


def test_feature_builder_rejects_outcome_fields() -> None:
    with pytest.raises(ValueError):
        build_app_inference_features_v1(
            {
                "user_ref": "user_1",
                "pre_decision_features": {
                    "prior_attempts_count": 1,
                    "post_score": 0.9,
                },
            }
        )


def test_static_fallback_keeps_current_two_factor_expectations() -> None:
    decision = create_static_six_factor_fallback()
    render_policy = map_six_factor_decision_to_render_policy(decision)

    assert render_policy["legacy_delivery"]["difficulty_target"] == decision["difficulty"]
    assert render_policy["legacy_delivery"]["depth"] == decision["depth"]
    assert render_policy["legacy_delivery"]["response_format"] == "mcq"


def test_experimental_adapter_is_not_enabled_by_default() -> None:
    assert is_experimental_six_factor_policy_enabled({}) is False
    assert is_experimental_six_factor_policy_enabled({EXPERIMENTAL_SIX_FACTOR_POLICY_ENV: "true"}) is True


def test_heuristic_bridge_from_current_two_factor_runtime_is_valid() -> None:
    decision = create_heuristic_six_factor_fallback_from_current_two_factor_runtime(
        {
            "difficulty": "hard",
            "depth": "detailed",
            "surface": "test",
            "renderingDecision": {"formattingHint": "scaffolded"},
        }
    )

    validate_app_six_factor_decision(decision)
    assert decision["difficulty"] == "hard"
    assert decision["depth"] == "detailed"
    assert decision["support_level"] == "scaffolded"
    assert decision["presentation_format"] == "step_by_step"
    assert decision["decision_source"] == "heuristic_baseline"


def test_builder_preserves_candidate_scorer_shape_without_outcomes() -> None:
    features = build_app_inference_features_v1(
        {
            "user_ref": "user_1",
            "subject_ref": "subject_1",
            "topic_ref": "topic_1",
            "pre_decision_features": {
                "prior_attempts_count": 5,
                "prior_correct_rate": 0.6,
                "recent_correct_rate": 0.5,
                "recent_attempts_count": 3,
                "topic_seen_count": 2,
                "minutes_since_last_activity": None,
                "session_position": 1,
                "declared_preference_difficulty": "medium",
                "declared_preference_depth": "standard",
                "declared_preference_format": "mcq",
            },
        }
    )
    observation = build_scorer_observation_from_app_features(
        features,
        create_static_six_factor_fallback(),
    )

    extracted = extract_features(observation)
    assert extracted["declared_format_missing"] == 1.0
    assert "outcome" not in observation
