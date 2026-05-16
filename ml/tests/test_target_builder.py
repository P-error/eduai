from __future__ import annotations

import pytest

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.target_builder import (
    DEFAULT_TARGET_SCHEMA_VERSION,
    TARGET_SCHEMA_V2,
    TargetUnavailableError,
    build_targets,
    build_targets_or_none,
)


def test_build_targets_computes_combined_score() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=34)[0]
    record["outcome"]["normalized_learning_gain"] = 0.4
    record["outcome"]["next_step_success"] = True
    targets = build_targets(record)
    assert DEFAULT_TARGET_SCHEMA_VERSION == TARGET_SCHEMA_V2
    assert targets["expected_learning_gain_proxy"] == 0.4
    assert targets["expected_learning_gain_signed"] == 0.4
    assert targets["expected_next_step_success"] == 1.0
    assert targets["combined_outcome_score"] == pytest.approx(0.775)


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


def test_default_signed_gain_negative_pre_08_post_06() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=37)[0]
    record["outcome"]["normalized_learning_gain"] = -1.0
    record["outcome"]["pre_score"] = 0.8
    record["outcome"]["post_score"] = 0.6
    record["outcome"]["max_score"] = 1.0
    record["outcome"]["next_step_success"] = False

    targets = build_targets(record)

    assert targets["expected_learning_gain_signed"] == pytest.approx(-1.0)
    assert targets["expected_learning_gain_proxy"] == 0.0


def test_default_signed_gain_positive_pre_04_post_08() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=38)[0]
    record["outcome"]["normalized_learning_gain"] = 2 / 3
    record["outcome"]["pre_score"] = 0.4
    record["outcome"]["post_score"] = 0.8
    record["outcome"]["max_score"] = 1.0
    record["outcome"]["next_step_success"] = True

    targets = build_targets(record)

    assert targets["expected_learning_gain_signed"] == pytest.approx(2 / 3)
    assert targets["expected_learning_gain_proxy"] == pytest.approx(2 / 3)


def test_outcome_unavailable_not_used_for_supervised_training() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=39)[0]
    record["outcome"]["outcome_available"] = False

    assert build_targets_or_none(record) is None
