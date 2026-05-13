from __future__ import annotations

from typing import Any, Mapping

from .factor_space import (
    BASELINE_CONFIG,
    EXPLORATION_CONFIGS,
    generate_bounded_candidate_set,
    generate_full_factor_grid,
)

__all__ = [
    "BASELINE_CONFIG",
    "EXPLORATION_CONFIGS",
    "generate_bounded_candidate_set",
    "generate_full_factor_grid",
]


def candidate_key(config: Mapping[str, Any]) -> str:
    return "|".join(str(config[factor]) for factor in BASELINE_CONFIG.keys())
