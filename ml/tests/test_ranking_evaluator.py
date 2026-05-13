from __future__ import annotations

from copy import deepcopy

from eduai_ml.data.synthetic_counterfactual import generate_synthetic_counterfactual_states
from eduai_ml.training.ranking_evaluator import evaluate_ranker_on_counterfactual_states
from eduai_ml.training.trainer import train_candidate_scorer
from eduai_ml.data.synthetic import generate_synthetic_observations


def test_ranking_evaluator_computes_regret_and_top3_rate() -> None:
    records = generate_synthetic_observations(8, 4, 5, seed=51)
    scorer = train_candidate_scorer(records, seed=42).scorer
    states = generate_synthetic_counterfactual_states(
        n_learners=4,
        n_topics=3,
        states_per_learner=3,
        max_candidates=12,
        seed=52,
    )
    report = evaluate_ranker_on_counterfactual_states(states, scorer, seed=42)
    assert report["ranking_metrics"]["mean_top1_regret"] is not None
    assert report["ranking_metrics"]["top3_contains_best_rate"] is not None


def test_ranking_evaluator_does_not_use_diagnostic_truth_as_feature() -> None:
    records = generate_synthetic_observations(8, 4, 5, seed=53)
    scorer = train_candidate_scorer(records, seed=42).scorer
    states = generate_synthetic_counterfactual_states(
        n_learners=3,
        n_topics=3,
        states_per_learner=2,
        max_candidates=12,
        seed=54,
    )
    changed = deepcopy(states)
    for state in changed:
        state["diagnostic_truth"]["notes"] = "changed diagnostic marker"
    first = evaluate_ranker_on_counterfactual_states(states, scorer, seed=42)["ranking_metrics"]
    second = evaluate_ranker_on_counterfactual_states(changed, scorer, seed=42)["ranking_metrics"]
    assert first == second
