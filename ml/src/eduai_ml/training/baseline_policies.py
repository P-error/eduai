from __future__ import annotations

import hashlib
from typing import Any, Mapping

from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES, generate_full_factor_grid, validate_factor_config

STATIC_BASELINE_CANDIDATE: dict[str, str] = {
    "difficulty": "medium",
    "depth": "standard",
    "support_level": "guided",
    "presentation_format": "step_by_step",
    "examples_level": "single",
    "terminology_level": "balanced",
}


def static_baseline_candidate() -> dict[str, str]:
    validate_factor_config(STATIC_BASELINE_CANDIDATE)
    return dict(STATIC_BASELINE_CANDIDATE)


def random_candidate_baseline(seed: int, observation: Mapping[str, Any] | None = None) -> dict[str, str]:
    observation_id = ""
    if observation is not None:
        observation_id = str(observation.get("ids", {}).get("observation_id", ""))
    digest = hashlib.sha256(f"{seed}:{observation_id}".encode("utf-8")).hexdigest()
    grid = generate_full_factor_grid()
    return dict(grid[int(digest[:12], 16) % len(grid)])


def heuristic_like_baseline(observation: Mapping[str, Any]) -> dict[str, str]:
    features = observation.get("pre_decision_features", {})
    prior = float(features.get("prior_correct_rate") or 0.0)
    recent = float(features.get("recent_correct_rate") or prior)
    readiness = (prior + recent) / 2

    if readiness < 0.45:
        candidate = {
            "difficulty": "easy",
            "depth": "detailed",
            "support_level": "scaffolded",
            "presentation_format": "step_by_step",
            "examples_level": "multiple",
            "terminology_level": "simple",
        }
    elif readiness < 0.75:
        candidate = {
            "difficulty": "medium",
            "depth": "standard",
            "support_level": "guided",
            "presentation_format": "step_by_step",
            "examples_level": "single",
            "terminology_level": "balanced",
        }
    else:
        topic_seen_count = int(features.get("topic_seen_count") or 0)
        candidate = {
            "difficulty": "hard",
            "depth": "brief" if topic_seen_count >= 3 else "standard",
            "support_level": "minimal" if recent >= 0.85 else "guided",
            "presentation_format": "paragraph" if recent >= 0.85 else "structured_list",
            "examples_level": "none" if topic_seen_count >= 4 else "single",
            "terminology_level": "technical" if recent >= 0.85 else "balanced",
        }

    validate_factor_config(candidate)
    return candidate


def oracle_upper_bound_for_synthetic(_records: list[Mapping[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "available": False,
        "reason": "oracle not available in current synthetic export because hidden effective_config is not emitted",
    }


def candidate_key(candidate: Mapping[str, str]) -> tuple[str, ...]:
    return tuple(candidate[factor] for factor in FACTOR_NAMES)


__all__ = [
    "STATIC_BASELINE_CANDIDATE",
    "candidate_key",
    "heuristic_like_baseline",
    "oracle_upper_bound_for_synthetic",
    "random_candidate_baseline",
    "static_baseline_candidate",
]
