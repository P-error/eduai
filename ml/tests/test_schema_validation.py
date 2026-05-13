from __future__ import annotations

from copy import deepcopy

import pytest

from eduai_ml.contracts import (
    load_model_artifact_example,
    load_training_observation_example,
)
from eduai_ml.validation import validate_model_artifact, validate_training_observation


def test_schema_validation_accepts_examples() -> None:
    validate_training_observation(load_training_observation_example())
    validate_model_artifact(load_model_artifact_example())


def test_schema_validation_rejects_invalid_factor() -> None:
    observation = load_training_observation_example()
    observation["candidate_config"]["difficulty"] = "impossible"
    with pytest.raises(ValueError):
        validate_training_observation(observation)


def test_schema_validation_rejects_missing_candidate_config() -> None:
    observation = load_training_observation_example()
    del observation["candidate_config"]
    with pytest.raises(ValueError):
        validate_training_observation(observation)


def test_leakage_guard_requires_pre_decision_data_flag() -> None:
    observation = load_training_observation_example()
    observation["leakage_guard"]["uses_only_pre_decision_data"] = False
    with pytest.raises(ValueError):
        validate_training_observation(observation)


def test_pre_decision_features_reject_outcome_fields() -> None:
    observation = deepcopy(load_training_observation_example())
    observation["pre_decision_features"]["next_step_success"] = True
    with pytest.raises(ValueError):
        validate_training_observation(observation)
