from __future__ import annotations

from eduai_ml.data.synthetic_counterfactual import (
    generate_synthetic_counterfactual_states,
    validate_counterfactual_state,
)
from eduai_ml.factor_space import validate_factor_config
from eduai_ml.training.baseline_policies import (
    candidate_key,
    heuristic_like_baseline,
    static_baseline_candidate,
)


def test_counterfactual_generator_is_deterministic() -> None:
    first = generate_synthetic_counterfactual_states(
        n_learners=3,
        n_topics=2,
        states_per_learner=3,
        max_candidates=12,
        seed=42,
    )
    second = generate_synthetic_counterfactual_states(
        n_learners=3,
        n_topics=2,
        states_per_learner=3,
        max_candidates=12,
        seed=42,
    )
    assert first == second


def test_counterfactual_state_contains_candidate_set_and_valid_candidates() -> None:
    state = generate_synthetic_counterfactual_states(
        n_learners=1,
        n_topics=2,
        states_per_learner=1,
        max_candidates=12,
        seed=43,
    )[0]
    validate_counterfactual_state(state)
    assert state["candidate_set"]
    for item in state["candidate_set"]:
        assert validate_factor_config(item["candidate_config"]) is True
        assert "combined_outcome_score" in item["synthetic_outcome"]


def test_counterfactual_candidate_set_contains_static_and_heuristic_baselines() -> None:
    state = generate_synthetic_counterfactual_states(
        n_learners=1,
        n_topics=2,
        states_per_learner=1,
        max_candidates=30,
        seed=44,
    )[0]
    candidate_keys = {candidate_key(item["candidate_config"]) for item in state["candidate_set"]}
    state_observation = {
        "pre_decision_features": state["pre_decision_features"],
        "candidate_config": state["candidate_set"][0]["candidate_config"],
        "ids": {
            "observation_id": state["state_id"],
            "subject_ref": state["ids"]["subject_ref"],
            "topic_ref": state["ids"]["topic_ref"],
        },
        "source": state["source"],
    }
    assert candidate_key(static_baseline_candidate()) in candidate_keys
    assert candidate_key(heuristic_like_baseline(state_observation)) in candidate_keys
