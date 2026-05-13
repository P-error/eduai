"""EduAI research ML contracts and candidate utilities."""

from .factor_space import (
    BASELINE_CONFIG,
    FACTOR_NAMES,
    FACTOR_SPACE_VERSION,
    FACTOR_VALUES,
    generate_bounded_candidate_set,
    generate_full_factor_grid,
    normalize_factor_config,
    validate_factor_config,
)

__all__ = [
    "BASELINE_CONFIG",
    "FACTOR_NAMES",
    "FACTOR_SPACE_VERSION",
    "FACTOR_VALUES",
    "generate_bounded_candidate_set",
    "generate_full_factor_grid",
    "normalize_factor_config",
    "validate_factor_config",
]
