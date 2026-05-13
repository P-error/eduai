from __future__ import annotations

from copy import deepcopy

import pytest

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.feature_extraction import OUTCOME_FIELD_NAMES, extract_features, get_feature_names


def test_extract_features_does_not_use_outcome_fields() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=31)[0]
    first = extract_features(record)
    changed = deepcopy(record)
    changed["outcome"]["post_score"] = 0.0
    changed["outcome"]["next_step_success"] = not changed["outcome"]["next_step_success"]
    changed["outcome"]["normalized_learning_gain"] = 0.0
    assert extract_features(changed) == first


def test_extract_features_is_deterministic() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=32)[0]
    assert extract_features(record) == extract_features(record)


def test_extract_features_rejects_outcome_in_pre_decision_features() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=33)[0]
    record["pre_decision_features"]["post_score"] = 1.0
    with pytest.raises(ValueError):
        extract_features(record)
    assert "post_score" in OUTCOME_FIELD_NAMES


def test_extract_features_includes_candidate_state_interactions() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=36)[0]
    record["pre_decision_features"].update(
        {
            "prior_attempts_count": 0,
            "prior_correct_rate": 0.0,
            "recent_attempts_count": 0,
            "recent_correct_rate": 0.0,
            "topic_seen_count": 0,
        }
    )
    record["candidate_config"] = {
        "difficulty": "hard",
        "depth": "brief",
        "support_level": "minimal",
        "presentation_format": "paragraph",
        "examples_level": "none",
        "terminology_level": "technical",
    }

    features = extract_features(record)

    assert "prior_correct_rate_x_candidate_difficulty_ordinal" in get_feature_names()
    assert features["unknown_state"] == 1.0
    assert features["unknown_state_x_candidate_difficulty__hard"] == 1.0
    assert features["unknown_state_x_candidate_examples_level__none"] == 1.0
    assert features["unknown_state_x_candidate_terminology_level__technical"] == 1.0
