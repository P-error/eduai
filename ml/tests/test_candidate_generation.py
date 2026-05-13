from __future__ import annotations

from eduai_ml.factor_space import BASELINE_CONFIG, generate_bounded_candidate_set


def test_bounded_candidate_set_does_not_exceed_limit() -> None:
    candidates = generate_bounded_candidate_set(BASELINE_CONFIG, max_candidates=30)
    assert len(candidates) <= 30


def test_bounded_candidate_set_is_deterministic() -> None:
    first = generate_bounded_candidate_set(BASELINE_CONFIG, max_candidates=30)
    second = generate_bounded_candidate_set(BASELINE_CONFIG, max_candidates=30)
    assert first == second


def test_bounded_candidate_set_starts_with_base_and_has_no_duplicates() -> None:
    candidates = generate_bounded_candidate_set(BASELINE_CONFIG, max_candidates=30)
    assert candidates[0] == BASELINE_CONFIG
    assert len({tuple(candidate.items()) for candidate in candidates}) == len(candidates)
