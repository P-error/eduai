from __future__ import annotations

from copy import deepcopy

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.factor_space import generate_bounded_candidate_set
from eduai_ml.training.trainer import train_candidate_scorer


def test_score_candidates_does_not_use_outcome_and_respects_max_candidates() -> None:
    records = generate_synthetic_observations(8, 4, 5, seed=45)
    result = train_candidate_scorer(records, seed=42)
    observation = records[0]
    candidates = generate_bounded_candidate_set(observation["candidate_config"], max_candidates=7)
    first_scores = []
    second_scores = []
    changed = deepcopy(observation)
    changed["outcome"]["normalized_learning_gain"] = 0.0
    changed["outcome"]["next_step_success"] = not changed["outcome"]["next_step_success"]
    for candidate in candidates:
        row = deepcopy(observation)
        row["candidate_config"] = candidate
        first_scores.append(result.scorer.score_observation(row))
        row2 = deepcopy(changed)
        row2["candidate_config"] = candidate
        second_scores.append(result.scorer.score_observation(row2))
    assert len(candidates) <= 7
    assert first_scores == second_scores
