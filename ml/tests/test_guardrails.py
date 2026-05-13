from __future__ import annotations

from eduai_ml.guardrails import (
    filter_unsafe_six_factor_candidates,
    is_safe_six_factor_candidate_for_learner_state,
    unsafe_six_factor_candidate_reasons,
)

UNKNOWN_FEATURES = {
    "prior_attempts_count": 0,
    "prior_correct_rate": 0.0,
    "recent_attempts_count": 0,
    "recent_correct_rate": 0.0,
    "topic_seen_count": 0,
}

UNSAFE_CANDIDATE = {
    "difficulty": "hard",
    "depth": "brief",
    "support_level": "minimal",
    "presentation_format": "paragraph",
    "examples_level": "none",
    "terminology_level": "technical",
}


def test_guardrails_reject_unknown_state_hard_brief_minimal() -> None:
    assert not is_safe_six_factor_candidate_for_learner_state(UNKNOWN_FEATURES, UNSAFE_CANDIDATE)
    reasons = unsafe_six_factor_candidate_reasons(UNKNOWN_FEATURES, UNSAFE_CANDIDATE)
    assert "weak_state_blocks_hard_brief_minimal" in reasons
    assert "weak_state_requires_at_least_single_example" in reasons


def test_guardrails_reject_low_correct_rate_minimal_and_no_examples() -> None:
    low_features = {
        "prior_attempts_count": 4,
        "prior_correct_rate": 0.25,
        "recent_attempts_count": 3,
        "recent_correct_rate": 0.2,
        "topic_seen_count": 1,
    }
    candidate = {
        **UNSAFE_CANDIDATE,
        "difficulty": "medium",
        "terminology_level": "balanced",
    }

    reasons = unsafe_six_factor_candidate_reasons(low_features, candidate)

    assert "weak_state_requires_guided_support" in reasons
    assert "weak_state_requires_at_least_single_example" in reasons


def test_guardrails_allow_none_and_technical_only_for_strong_mastered_history() -> None:
    mastered_features = {
        "prior_attempts_count": 10,
        "prior_correct_rate": 0.9,
        "recent_attempts_count": 4,
        "recent_correct_rate": 0.85,
        "topic_seen_count": 4,
    }
    candidate = {
        **UNSAFE_CANDIDATE,
        "depth": "standard",
        "support_level": "guided",
    }

    assert is_safe_six_factor_candidate_for_learner_state(mastered_features, candidate)


def test_guardrails_return_safe_fallback_when_all_candidates_are_filtered() -> None:
    result = filter_unsafe_six_factor_candidates(UNKNOWN_FEATURES, [UNSAFE_CANDIDATE])

    assert result.fallback_used is True
    assert result.candidates == [
        {
            "difficulty": "medium",
            "depth": "standard",
            "support_level": "guided",
            "presentation_format": "structured_list",
            "examples_level": "single",
            "terminology_level": "balanced",
        }
    ]
