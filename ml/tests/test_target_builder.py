from __future__ import annotations

import pytest

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.target_builder import TARGET_SCHEMA_V2, TargetUnavailableError, build_targets


def test_build_targets_computes_combined_score() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=34)[0]
    record["outcome"]["normalized_learning_gain"] = 0.4
    record["outcome"]["next_step_success"] = True
    targets = build_targets(record)
    assert targets["expected_learning_gain_proxy"] == 0.4
    assert targets["expected_next_step_success"] == 1.0
    assert targets["combined_outcome_score"] == pytest.approx(0.55)


def test_build_targets_rejects_unavailable_outcome() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=35)[0]
    record["outcome"]["outcome_available"] = False
    with pytest.raises(TargetUnavailableError):
        build_targets(record)


def test_v2_signed_gain_preserves_negative_values() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=36)[0]
    record["outcome"]["normalized_learning_gain"] = -0.35
    record["outcome"]["next_step_success"] = False

    targets = build_targets(record, target_schema_version=TARGET_SCHEMA_V2)

    assert targets["expected_learning_gain_signed"] == pytest.approx(-0.35)
    assert targets["expected_learning_gain_proxy"] == 0.0
    assert targets["combined_outcome_score"] == pytest.approx(0.24375)
