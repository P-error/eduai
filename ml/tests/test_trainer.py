from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.trainer import train_candidate_scorer


def test_trainer_skips_rows_with_unavailable_outcome() -> None:
    records = generate_synthetic_observations(5, 3, 4, seed=39)
    records[0]["outcome"]["outcome_available"] = False
    result = train_candidate_scorer(records, seed=42)
    assert result.skipped_rows == 1


def test_trainer_creates_artifact_on_small_synthetic_dataset() -> None:
    records = generate_synthetic_observations(8, 3, 5, seed=40)
    result = train_candidate_scorer(records, seed=42)
    assert result.artifact["artifact_kind"] == "eduai_native_pedagogy_artifact"
    assert result.artifact["model"]["weights_or_serialized_payload"]["feature_names"]


def test_training_same_seed_reproducible_by_metrics() -> None:
    records = generate_synthetic_observations(8, 3, 5, seed=41)
    first = train_candidate_scorer(records, seed=42)
    second = train_candidate_scorer(records, seed=42)
    assert first.evaluation_report["model_metrics"] == second.evaluation_report["model_metrics"]
