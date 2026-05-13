from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from eduai_ml.factor_space import BASELINE_CONFIG, FACTOR_NAMES, normalize_factor_config

LOW_CORRECT_RATE_THRESHOLD = 0.45
HIGH_CORRECT_RATE_THRESHOLD = 0.75
CONFIDENT_MASTERY_RATE_THRESHOLD = 0.8
STRONG_HISTORY_MIN_PRIOR_ATTEMPTS = 8
STRONG_HISTORY_MIN_RECENT_ATTEMPTS = 3
STRONG_HISTORY_MIN_TOPIC_SEEN = 2
CONFIDENT_MASTERY_MIN_TOPIC_SEEN = 3


@dataclass(frozen=True)
class LearnerStateSafetyProfile:
    unknown_state: bool
    low_correct_rate: bool
    high_correct_rate: bool
    strong_history: bool
    confident_topic_mastery: bool
    weak_state: bool


@dataclass(frozen=True)
class CandidateFilterResult:
    candidates: list[dict[str, str]]
    filtered_count: int
    unsafe_reasons: dict[str, list[str]]
    fallback_used: bool


def _rate(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, numeric))


def _count(value: Any) -> float:
    if value is None:
        return 0.0
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, numeric)


def candidate_key(candidate: Mapping[str, Any]) -> str:
    normalized = normalize_factor_config(candidate)
    return "|".join(normalized[factor] for factor in FACTOR_NAMES)


def build_learner_state_safety_profile(
    pre_decision_features: Mapping[str, Any],
) -> LearnerStateSafetyProfile:
    prior_attempts = _count(pre_decision_features.get("prior_attempts_count"))
    recent_attempts = _count(pre_decision_features.get("recent_attempts_count"))
    topic_seen = _count(pre_decision_features.get("topic_seen_count"))
    prior_rate = _rate(pre_decision_features.get("prior_correct_rate"))
    recent_rate = _rate(pre_decision_features.get("recent_correct_rate"))
    unknown_state = prior_attempts == 0 and recent_attempts == 0 and topic_seen == 0
    low_correct_rate = (
        not unknown_state
        and (
            (prior_attempts > 0 and prior_rate < LOW_CORRECT_RATE_THRESHOLD)
            or (recent_attempts > 0 and recent_rate < LOW_CORRECT_RATE_THRESHOLD)
        )
    )
    strong_history = (
        prior_attempts >= STRONG_HISTORY_MIN_PRIOR_ATTEMPTS
        and recent_attempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS
        and topic_seen >= STRONG_HISTORY_MIN_TOPIC_SEEN
        and prior_rate >= HIGH_CORRECT_RATE_THRESHOLD
        and recent_rate >= HIGH_CORRECT_RATE_THRESHOLD
    )
    confident_topic_mastery = (
        topic_seen >= CONFIDENT_MASTERY_MIN_TOPIC_SEEN
        and recent_attempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS
        and prior_rate >= CONFIDENT_MASTERY_RATE_THRESHOLD
        and recent_rate >= CONFIDENT_MASTERY_RATE_THRESHOLD
    )
    high_correct_rate = (
        not unknown_state
        and prior_attempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS
        and recent_attempts >= STRONG_HISTORY_MIN_RECENT_ATTEMPTS
        and prior_rate >= HIGH_CORRECT_RATE_THRESHOLD
        and recent_rate >= HIGH_CORRECT_RATE_THRESHOLD
    )

    return LearnerStateSafetyProfile(
        unknown_state=unknown_state,
        low_correct_rate=low_correct_rate,
        high_correct_rate=high_correct_rate,
        strong_history=strong_history,
        confident_topic_mastery=confident_topic_mastery,
        weak_state=unknown_state or low_correct_rate,
    )


def unsafe_six_factor_candidate_reasons(
    pre_decision_features: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> list[str]:
    profile = build_learner_state_safety_profile(pre_decision_features)
    config = normalize_factor_config(candidate)
    reasons: list[str] = []

    if (
        profile.weak_state
        and config["difficulty"] == "hard"
        and config["depth"] == "brief"
        and config["support_level"] == "minimal"
    ):
        reasons.append("weak_state_blocks_hard_brief_minimal")
    if profile.weak_state and config["support_level"] == "minimal":
        reasons.append("weak_state_requires_guided_support")
    if profile.weak_state and config["examples_level"] == "none":
        reasons.append("weak_state_requires_at_least_single_example")
    if config["examples_level"] == "none" and not profile.strong_history:
        reasons.append("examples_none_requires_strong_history")
    if config["terminology_level"] == "technical" and not profile.confident_topic_mastery:
        reasons.append("technical_terminology_requires_confident_topic_mastery")

    return reasons


def is_safe_six_factor_candidate_for_learner_state(
    pre_decision_features: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> bool:
    return not unsafe_six_factor_candidate_reasons(pre_decision_features, candidate)


def safe_six_factor_fallback_candidate() -> dict[str, str]:
    return dict(BASELINE_CONFIG)


def filter_unsafe_six_factor_candidates(
    pre_decision_features: Mapping[str, Any],
    candidates: Sequence[Mapping[str, Any]],
    *,
    use_fallback: bool = True,
) -> CandidateFilterResult:
    safe_candidates: list[dict[str, str]] = []
    unsafe_reasons: dict[str, list[str]] = {}

    for candidate in candidates:
        normalized = normalize_factor_config(candidate)
        reasons = unsafe_six_factor_candidate_reasons(pre_decision_features, normalized)
        if reasons:
            unsafe_reasons[candidate_key(normalized)] = reasons
            continue
        safe_candidates.append(normalized)

    fallback_used = False
    if not safe_candidates and use_fallback:
        fallback = safe_six_factor_fallback_candidate()
        safe_candidates = [fallback]
        fallback_used = True

    return CandidateFilterResult(
        candidates=safe_candidates,
        filtered_count=len(unsafe_reasons),
        unsafe_reasons=unsafe_reasons,
        fallback_used=fallback_used,
    )


def is_intrinsically_risky_six_factor_candidate(candidate: Mapping[str, Any]) -> bool:
    config = normalize_factor_config(candidate)
    return (
        (
            config["difficulty"] == "hard"
            and config["depth"] == "brief"
            and config["support_level"] == "minimal"
        )
        or config["examples_level"] == "none"
        or config["terminology_level"] == "technical"
    )
