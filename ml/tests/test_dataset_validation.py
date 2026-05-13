from __future__ import annotations

import pytest

from eduai_ml.data.dataset_validation import (
    summarize_observations,
    supervised_training_readiness,
    validate_observation_record,
)
from eduai_ml.data.real_user_adapter import normalize_real_user_observation
from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.factor_space import FACTOR_NAMES


def test_validate_observation_record_accepts_synthetic_record() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=22)[0]
    validate_observation_record(record)


def test_real_user_adapter_requires_delivered_config() -> None:
    raw = generate_synthetic_observations(1, 1, 1, seed=23)[0]
    raw["source"]["source_kind"] = "real_user"
    del raw["delivered_config"]
    with pytest.raises(ValueError):
        normalize_real_user_observation(raw)


def test_summarize_observations_returns_counts_for_all_six_factors() -> None:
    records = generate_synthetic_observations(4, 3, 6, seed=24)
    summary = summarize_observations(records)
    assert summary["total_observations"] == 24
    assert set(summary["factor_distribution"].keys()) == set(FACTOR_NAMES)
    for factor in FACTOR_NAMES:
        assert sum(summary["factor_distribution"][factor].values()) == 24
    assert summary["leakage_guard_violations_count"] == 0


def test_supervised_readiness_marks_rows_without_outcome_unusable() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=25)[0]
    record["outcome"]["outcome_available"] = False

    readiness = supervised_training_readiness(record)

    assert readiness.usable is False
    assert readiness.reason == "outcome_unavailable"


def test_validate_observation_record_reports_delivered_config_contract_error() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=26)[0]
    del record["delivered_config"]["terminology_level"]

    with pytest.raises(ValueError, match="delivered_config must contain all six valid factors"):
        validate_observation_record(record)
