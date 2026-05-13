from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.artifact_loader import load_candidate_scorer_artifact
from eduai_ml.training.artifact_writer import write_model_artifact
from eduai_ml.training.trainer import train_candidate_scorer
from eduai_ml.validation import validate_model_artifact


def test_artifact_passes_schema_validation() -> None:
    records = generate_synthetic_observations(6, 3, 5, seed=42)
    result = train_candidate_scorer(records, seed=42)
    validate_model_artifact(result.artifact)


def test_artifact_write_and_load_roundtrip(tmp_path) -> None:
    records = generate_synthetic_observations(6, 3, 5, seed=43)
    result = train_candidate_scorer(records, seed=42)
    path = tmp_path / "artifact.json"
    write_model_artifact(path, result.artifact)
    artifact, scorer = load_candidate_scorer_artifact(path)
    assert artifact["model_version"] == result.artifact["model_version"]
    assert scorer.score_observation(records[0])
