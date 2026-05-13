from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.training.feature_extraction import extract_features
from eduai_ml.training.simple_scorer import train_simple_candidate_scorer
from eduai_ml.training.target_builder import build_targets


def test_simple_scorer_trains_and_scores() -> None:
    records = generate_synthetic_observations(4, 3, 5, seed=38)
    scorer = train_simple_candidate_scorer(
        [extract_features(record) for record in records],
        [build_targets(record) for record in records],
        epochs=5,
    )
    prediction = scorer.score_observation(records[0])
    assert 0 <= prediction["expected_learning_gain_proxy"] <= 1
    assert 0 <= prediction["expected_next_step_success"] <= 1
    assert 0 <= prediction["combined_outcome_score"] <= 1
