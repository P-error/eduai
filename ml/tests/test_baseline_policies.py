from __future__ import annotations

from eduai_ml.data.synthetic import generate_synthetic_observations
from eduai_ml.factor_space import validate_factor_config
from eduai_ml.training.baseline_policies import (
    heuristic_like_baseline,
    random_candidate_baseline,
    static_baseline_candidate,
)


def test_static_baseline_candidate_is_valid() -> None:
    assert validate_factor_config(static_baseline_candidate()) is True


def test_heuristic_like_baseline_returns_valid_candidate() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=36)[0]
    assert validate_factor_config(heuristic_like_baseline(record)) is True


def test_random_candidate_baseline_is_deterministic() -> None:
    record = generate_synthetic_observations(1, 1, 1, seed=37)[0]
    assert random_candidate_baseline(42, record) == random_candidate_baseline(42, record)
