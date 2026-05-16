from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.evaluator import evaluate_candidate_scorer
from eduai_ml.training.target_builder import TARGET_SCHEMA_V2
from eduai_ml.training.trainer import train_candidate_scorer


def test_evaluator_returns_mae_and_rmse() -> None:
    records = generate_synthetic_observations(8, 4, 5, seed=44)
    result = train_candidate_scorer(records, seed=42)
    report = evaluate_candidate_scorer(records, result.scorer, seed=42)
    test_metrics = report["model_metrics"]["test"]
    assert test_metrics["expected_learning_gain_proxy"]["mae"] is not None
    assert test_metrics["expected_learning_gain_proxy"]["rmse"] is not None
    assert test_metrics["combined_outcome_score"]["mae"] is not None
    assert test_metrics["combined_outcome_score"]["rmse"] is not None


def test_evaluator_supports_user_based_split_and_policy_risk_report() -> None:
    records = generate_synthetic_observations(10, 4, 5, seed=45)
    result = train_candidate_scorer(records, seed=42, split_strategy="user_id_hash")
    report = evaluate_candidate_scorer(
        records,
        result.scorer,
        seed=42,
        split_strategy="user_id_hash",
    )

    assert report["split_strategy"] == "user_id_hash"
    assert "users_overlap_counts" in report["split_diagnostics"]
    assert "policy_selection_risk_diagnostics" in report
    assert "guarded_top1" in report["policy_selection_risk_diagnostics"]


def test_evaluator_reports_signed_gain_metrics_for_v2_targets() -> None:
    records = generate_synthetic_observations(8, 4, 5, seed=46)
    records[0]["outcome"]["normalized_learning_gain"] = -0.4
    result = train_candidate_scorer(
        records,
        seed=42,
        target_schema_version=TARGET_SCHEMA_V2,
    )
    report = evaluate_candidate_scorer(
        records,
        result.scorer,
        seed=42,
        target_schema_version=TARGET_SCHEMA_V2,
    )

    test_metrics = report["model_metrics"]["test"]
    assert report["target_schema_version"] == TARGET_SCHEMA_V2
    assert test_metrics["expected_learning_gain_proxy"]["rmse"] is not None
    assert test_metrics["expected_learning_gain_signed"]["rmse"] is not None
    assert test_metrics["combined_outcome_score"]["rmse"] is not None
