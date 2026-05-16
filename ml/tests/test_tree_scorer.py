from __future__ import annotations

import pytest

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.target_builder import TARGET_SCHEMA_V2
from eduai_ml.training.trainer import train_candidate_scorer


pytest.importorskip("sklearn")


def test_tree_candidate_scorer_trains_on_small_sample() -> None:
    records = generate_synthetic_observations(10, 3, 5, seed=61)
    records[0]["outcome"]["normalized_learning_gain"] = -0.2

    result = train_candidate_scorer(
        records,
        seed=42,
        model_family="tree_candidate_scorer_v1",
        model_variant="extra_trees",
        split_strategy="user_id_hash",
        target_schema_version=TARGET_SCHEMA_V2,
    )

    test_metrics = result.evaluation_report["model_metrics"]["test"]
    assert result.artifact["model"]["model_family"] == "tree_candidate_scorer_v1"
    assert result.artifact["target_definition"]["target_schema_version"] == TARGET_SCHEMA_V2
    assert test_metrics["expected_learning_gain_signed"]["rmse"] is not None
    assert test_metrics["combined_outcome_score"]["rmse"] is not None
