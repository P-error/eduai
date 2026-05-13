from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.data.dataset_validation import OUTCOME_FIELD_NAMES
from eduai_ml.validation import validate_training_observation


def test_synthetic_generator_is_deterministic_for_same_seed() -> None:
    first = generate_synthetic_observations(3, 2, 4, seed=123)
    second = generate_synthetic_observations(3, 2, 4, seed=123)
    assert first == second


def test_synthetic_generator_creates_requested_count() -> None:
    records = generate_synthetic_observations(5, 3, 7, seed=7)
    assert len(records) == 35


def test_all_synthetic_observations_validate_against_schema() -> None:
    records = generate_synthetic_observations(4, 3, 5, seed=9)
    for record in records:
        validate_training_observation(record)
        assert record["source"]["source_kind"] == "synthetic"


def test_synthetic_delivered_config_equals_candidate_config() -> None:
    records = generate_synthetic_observations(3, 3, 5, seed=10)
    assert all(record["delivered_config"] == record["candidate_config"] for record in records)


def test_synthetic_candidates_are_diverse() -> None:
    records = generate_synthetic_observations(4, 4, 8, seed=11)
    candidates = {tuple(record["candidate_config"].items()) for record in records}
    assert len(candidates) > 1


def test_synthetic_learning_gain_is_in_v1_range() -> None:
    records = generate_synthetic_observations(3, 3, 6, seed=12)
    for record in records:
        gain = record["outcome"]["normalized_learning_gain"]
        assert 0 <= gain <= 1


def test_synthetic_pre_decision_features_have_no_outcome_fields() -> None:
    records = generate_synthetic_observations(3, 3, 6, seed=13)
    for record in records:
        assert not (set(record["pre_decision_features"]) & OUTCOME_FIELD_NAMES)
