from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from eduai_ml.factor_space import (
    BASELINE_CONFIG,
    FACTOR_NAMES,
    FACTOR_VALUES,
    generate_bounded_candidate_set,
    generate_full_factor_grid,
    normalize_factor_config,
)

CandidateStrategy = Literal["bounded", "full_grid"]


@dataclass(frozen=True)
class SyntheticLearnerProfile:
    base_ability: float
    learning_rate: float
    noise_level: float
    effective_config: dict[str, str]
    declared_preference_difficulty: str | None
    declared_preference_depth: str | None
    declared_preference_format: str | None


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _pick(values: tuple[str, ...], rng: random.Random) -> str:
    return values[rng.randrange(len(values))]


def _neighbor_value(factor: str, value: str, rng: random.Random) -> str:
    values = FACTOR_VALUES[factor]
    index = values.index(value)
    possible = [index]
    if index > 0:
        possible.append(index - 1)
    if index < len(values) - 1:
        possible.append(index + 1)
    return values[possible[rng.randrange(len(possible))]]


def _opposite_value(factor: str, value: str) -> str:
    values = FACTOR_VALUES[factor]
    index = values.index(value)
    return values[len(values) - 1 - index]


def _make_profile(rng: random.Random) -> SyntheticLearnerProfile:
    effective_config = {
        factor: _pick(FACTOR_VALUES[factor], rng) for factor in FACTOR_NAMES
    }

    # Русский комментарий: declared preference намеренно шумный и не равен effective config.
    declared_difficulty = (
        _neighbor_value("difficulty", effective_config["difficulty"], rng)
        if rng.random() < 0.72
        else _pick(FACTOR_VALUES["difficulty"], rng)
    )
    declared_depth = (
        _neighbor_value("depth", effective_config["depth"], rng)
        if rng.random() < 0.72
        else _pick(FACTOR_VALUES["depth"], rng)
    )
    declared_format = (
        effective_config["presentation_format"]
        if rng.random() < 0.55
        else _pick(FACTOR_VALUES["presentation_format"], rng)
    )

    return SyntheticLearnerProfile(
        base_ability=round(rng.uniform(0.18, 0.88), 4),
        learning_rate=round(rng.uniform(0.08, 0.42), 4),
        noise_level=round(rng.uniform(0.015, 0.09), 4),
        effective_config=effective_config,
        declared_preference_difficulty=declared_difficulty,
        declared_preference_depth=declared_depth,
        declared_preference_format=declared_format,
    )


def _factor_similarity(factor: str, candidate_value: str, effective_value: str) -> float:
    values = FACTOR_VALUES[factor]
    candidate_index = values.index(candidate_value)
    effective_index = values.index(effective_value)
    if len(values) == 1:
        return 1.0
    distance = abs(candidate_index - effective_index)
    max_distance = len(values) - 1
    return 1.0 - (distance / max_distance)


def _config_match_score(candidate_config: dict[str, str], effective_config: dict[str, str]) -> float:
    score = sum(
        _factor_similarity(factor, candidate_config[factor], effective_config[factor])
        for factor in FACTOR_NAMES
    )
    return score / len(FACTOR_NAMES)


def _near_optimal_candidate(profile: SyntheticLearnerProfile, rng: random.Random) -> dict[str, str]:
    candidate = dict(profile.effective_config)
    factor_to_shift = FACTOR_NAMES[rng.randrange(len(FACTOR_NAMES))]
    if rng.random() < 0.45:
        candidate[factor_to_shift] = _neighbor_value(
            factor_to_shift,
            candidate[factor_to_shift],
            rng,
        )
    return normalize_factor_config(candidate)


def _mismatched_candidate(profile: SyntheticLearnerProfile) -> dict[str, str]:
    return normalize_factor_config(
        {
            factor: _opposite_value(factor, profile.effective_config[factor])
            for factor in FACTOR_NAMES
        }
    )


def _random_candidate(rng: random.Random, candidate_strategy: CandidateStrategy) -> dict[str, str]:
    if candidate_strategy == "bounded":
        base = {
            factor: _pick(FACTOR_VALUES[factor], rng) for factor in FACTOR_NAMES
        }
        candidates = generate_bounded_candidate_set(base, max_candidates=30)
        return dict(candidates[rng.randrange(len(candidates))])
    if candidate_strategy == "full_grid":
        grid = generate_full_factor_grid()
        return dict(grid[rng.randrange(len(grid))])
    raise ValueError(f"Unsupported candidate_strategy: {candidate_strategy}")


def _choose_candidate(
    profile: SyntheticLearnerProfile,
    observation_index: int,
    rng: random.Random,
    candidate_strategy: CandidateStrategy,
) -> dict[str, str]:
    bucket = observation_index % 4
    if bucket == 0:
        return _near_optimal_candidate(profile, rng)
    if bucket == 1:
        return dict(BASELINE_CONFIG)
    if bucket == 2:
        return _random_candidate(rng, candidate_strategy)
    return _mismatched_candidate(profile)


def _safe_learning_gain(pre_score: float, post_score: float, max_score: float) -> float:
    if max_score is not None and pre_score is not None and max_score > pre_score:
        return _clamp((post_score - pre_score) / (max_score - pre_score))
    return 0.0


def compute_synthetic_pre_score(
    profile: SyntheticLearnerProfile,
    pre_decision_features: dict[str, Any],
    rng: random.Random,
) -> float:
    prior_correct_rate = float(pre_decision_features["prior_correct_rate"])
    recent_correct_rate = float(pre_decision_features["recent_correct_rate"])
    topic_seen_count = int(pre_decision_features["topic_seen_count"])
    session_position = int(pre_decision_features["session_position"])

    readiness = (
        profile.base_ability * 0.45
        + prior_correct_rate * 0.24
        + recent_correct_rate * 0.18
        + min(topic_seen_count, 8) * 0.015
        + min(session_position, 12) * 0.006
    )
    return _clamp(readiness + rng.uniform(-profile.noise_level, profile.noise_level))


def compute_synthetic_outcome(
    profile: SyntheticLearnerProfile,
    pre_decision_features: dict[str, Any],
    candidate_config: dict[str, str],
    rng: random.Random,
    *,
    pre_score_override: float | None = None,
) -> dict[str, Any]:
    max_score = 1.0
    candidate_config = normalize_factor_config(candidate_config)
    match_score = _config_match_score(candidate_config, profile.effective_config)
    mismatch_penalty = 1.0 - match_score
    recent_correct_rate = float(pre_decision_features["recent_correct_rate"])
    pre_score = (
        pre_score_override
        if pre_score_override is not None
        else compute_synthetic_pre_score(profile, pre_decision_features, rng)
    )

    gain_potential = (
        0.05
        + profile.learning_rate * 0.55
        + match_score * 0.36
        + recent_correct_rate * 0.08
        - mismatch_penalty * 0.28
        + rng.uniform(-profile.noise_level, profile.noise_level)
    )
    normalized_learning_gain = _clamp(gain_potential)
    post_score = _clamp(pre_score + normalized_learning_gain * (max_score - pre_score))
    normalized_learning_gain = _safe_learning_gain(pre_score, post_score, max_score)

    # Русский комментарий: success намеренно не равен простому post_score, чтобы избежать 99/1 перекоса.
    success_evidence = (
        post_score * 0.55
        + normalized_learning_gain * 0.25
        + match_score * 0.1
        + recent_correct_rate * 0.1
        - mismatch_penalty * 0.12
        + rng.uniform(-profile.noise_level, profile.noise_level)
    )
    next_step_success = success_evidence >= 0.62

    return {
        "pre_score": round(pre_score, 4),
        "post_score": round(post_score, 4),
        "max_score": max_score,
        "next_step_success": next_step_success,
        "normalized_learning_gain": round(normalized_learning_gain, 4),
        "outcome_available": True,
    }


def _build_pre_decision_features(
    profile: SyntheticLearnerProfile,
    history: list[bool],
    topic_seen_count: int,
    session_position: int,
    rng: random.Random,
) -> dict[str, Any]:
    prior_attempts_count = len(history)
    prior_correct_rate = (
        sum(1 for value in history if value) / prior_attempts_count
        if prior_attempts_count
        else profile.base_ability
    )
    recent_window = history[-5:]
    recent_attempts_count = len(recent_window)
    recent_correct_rate = (
        sum(1 for value in recent_window if value) / recent_attempts_count
        if recent_attempts_count
        else profile.base_ability
    )

    return {
        "prior_attempts_count": prior_attempts_count,
        "prior_correct_rate": round(_clamp(prior_correct_rate), 4),
        "recent_correct_rate": round(_clamp(recent_correct_rate), 4),
        "recent_attempts_count": recent_attempts_count,
        "topic_seen_count": topic_seen_count,
        "minutes_since_last_activity": round(rng.uniform(8, 240), 2),
        "session_position": session_position,
        "declared_preference_difficulty": profile.declared_preference_difficulty,
        "declared_preference_depth": profile.declared_preference_depth,
        "declared_preference_format": profile.declared_preference_format,
    }


def _build_outcome(
    profile: SyntheticLearnerProfile,
    pre_decision_features: dict[str, Any],
    candidate_config: dict[str, str],
    rng: random.Random,
) -> dict[str, Any]:
    return compute_synthetic_outcome(profile, pre_decision_features, candidate_config, rng)


def generate_synthetic_observations(
    n_learners: int,
    n_topics: int,
    observations_per_learner: int,
    seed: int,
    candidate_strategy: CandidateStrategy = "bounded",
) -> list[dict[str, Any]]:
    if n_learners < 1:
        raise ValueError("n_learners must be positive")
    if n_topics < 1:
        raise ValueError("n_topics must be positive")
    if observations_per_learner < 1:
        raise ValueError("observations_per_learner must be positive")
    if candidate_strategy not in {"bounded", "full_grid"}:
        raise ValueError("candidate_strategy must be 'bounded' or 'full_grid'")

    rng = random.Random(seed)
    profiles = [_make_profile(rng) for _ in range(n_learners)]
    histories: list[list[bool]] = [[] for _ in range(n_learners)]
    topic_seen: list[dict[int, int]] = [dict() for _ in range(n_learners)]
    base_time = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)

    observations: list[dict[str, Any]] = []
    for learner_index, profile in enumerate(profiles):
        for local_index in range(observations_per_learner):
            global_index = learner_index * observations_per_learner + local_index
            topic_index = (local_index + learner_index + rng.randrange(n_topics)) % n_topics
            topic_seen_count = topic_seen[learner_index].get(topic_index, 0)
            session_position = local_index % 12
            decision_time = base_time + timedelta(minutes=global_index * 17)
            outcome_time = decision_time + timedelta(minutes=12)

            candidate_config = _choose_candidate(
                profile,
                global_index,
                rng,
                candidate_strategy,
            )
            pre_decision_features = _build_pre_decision_features(
                profile,
                histories[learner_index],
                topic_seen_count,
                session_position,
                rng,
            )
            outcome = _build_outcome(
                profile,
                pre_decision_features,
                candidate_config,
                rng,
            )

            learner_ref = f"synthetic_learner_{learner_index + 1:04d}"
            topic_ref = f"synthetic_topic_{topic_index + 1:04d}"
            observation_id = f"syn_s{seed}_l{learner_index + 1:04d}_o{local_index + 1:04d}"

            observations.append(
                {
                    "schema_version": "training_observation.v1",
                    "ids": {
                        "observation_id": observation_id,
                        "user_ref": learner_ref,
                        "subject_ref": "synthetic_subject_general",
                        "topic_ref": topic_ref,
                        "session_ref": f"synthetic_session_{learner_index + 1:04d}_{(local_index // 10) + 1:03d}",
                        "content_event_ref": f"synthetic_content_{observation_id}",
                        "test_event_ref": f"synthetic_test_{observation_id}",
                    },
                    "timestamps": {
                        "decision_created_at": decision_time.isoformat().replace("+00:00", "Z"),
                        "outcome_observed_at": outcome_time.isoformat().replace("+00:00", "Z"),
                    },
                    "source": {
                        "source_kind": "synthetic",
                        "source_name": "eduai_synthetic_candidate_outcome_v1",
                        "source_version": "v1",
                        "adapter_version": None,
                    },
                    "pre_decision_features": pre_decision_features,
                    "candidate_config": dict(candidate_config),
                    "delivered_config": dict(candidate_config),
                    "outcome": outcome,
                    "leakage_guard": {
                        "features_cutoff_at": decision_time.isoformat().replace("+00:00", "Z"),
                        "uses_only_pre_decision_data": True,
                        "notes": "Synthetic hidden effective_config is generation-only metadata and is not emitted as a feature.",
                    },
                    "policy_context": {
                        "policy_id": "synthetic_data_generation_v1",
                        "model_version": None,
                        "backend_kind": "synthetic_generator",
                        "fallback_used": False,
                    },
                }
            )

            histories[learner_index].append(bool(outcome["next_step_success"]))
            topic_seen[learner_index][topic_index] = topic_seen_count + 1

    return observations
