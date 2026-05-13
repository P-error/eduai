from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.data.synthetic_counterfactual import (
    generate_synthetic_counterfactual_states,
    write_counterfactual_jsonl,
)
from eduai_ml.training.artifact_writer import write_model_artifact
from eduai_ml.training.ranking_evaluator import evaluate_ranker_from_files
from eduai_ml.training.trainer import train_candidate_scorer


def test_evaluate_candidate_ranker_writes_eval_json(tmp_path) -> None:
    records = generate_synthetic_observations(8, 4, 5, seed=63)
    result = train_candidate_scorer(records, seed=42)
    artifact_path = tmp_path / "artifact.json"
    write_model_artifact(artifact_path, result.artifact)
    states = generate_synthetic_counterfactual_states(
        n_learners=3,
        n_topics=3,
        states_per_learner=2,
        max_candidates=12,
        seed=64,
    )
    counterfactual_path = tmp_path / "counterfactual.jsonl"
    write_counterfactual_jsonl(counterfactual_path, states)
    eval_path = tmp_path / "ranker_eval.json"
    report = evaluate_ranker_from_files(
        artifact_path=artifact_path,
        counterfactual_input_path=counterfactual_path,
        eval_out_path=eval_path,
    )
    assert eval_path.exists()
    assert report["ranking_metrics"]["mean_top1_regret"] is not None
