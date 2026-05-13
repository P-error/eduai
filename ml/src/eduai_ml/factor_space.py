from __future__ import annotations

from itertools import product
from typing import Any, Mapping

FACTOR_SPACE_VERSION = "factor_space.v1"

FACTOR_NAMES: tuple[str, ...] = (
    "difficulty",
    "depth",
    "support_level",
    "presentation_format",
    "examples_level",
    "terminology_level",
)

FACTOR_VALUES: dict[str, tuple[str, ...]] = {
    "difficulty": ("easy", "medium", "hard"),
    "depth": ("brief", "standard", "detailed"),
    "support_level": ("minimal", "guided", "scaffolded"),
    "presentation_format": ("paragraph", "structured_list", "step_by_step", "qa"),
    "examples_level": ("none", "single", "multiple"),
    "terminology_level": ("simple", "balanced", "technical"),
}

BASELINE_CONFIG: dict[str, str] = {
    "difficulty": "medium",
    "depth": "standard",
    "support_level": "guided",
    "presentation_format": "structured_list",
    "examples_level": "single",
    "terminology_level": "balanced",
}

EXPLORATION_CONFIGS: tuple[dict[str, str], ...] = (
    {
        "difficulty": "easy",
        "depth": "brief",
        "support_level": "minimal",
        "presentation_format": "paragraph",
        "examples_level": "none",
        "terminology_level": "simple",
    },
    {
        "difficulty": "hard",
        "depth": "detailed",
        "support_level": "scaffolded",
        "presentation_format": "step_by_step",
        "examples_level": "multiple",
        "terminology_level": "technical",
    },
    {
        "difficulty": "medium",
        "depth": "detailed",
        "support_level": "guided",
        "presentation_format": "qa",
        "examples_level": "multiple",
        "terminology_level": "balanced",
    },
    {
        "difficulty": "medium",
        "depth": "brief",
        "support_level": "minimal",
        "presentation_format": "structured_list",
        "examples_level": "single",
        "terminology_level": "simple",
    },
    {
        "difficulty": "hard",
        "depth": "standard",
        "support_level": "guided",
        "presentation_format": "paragraph",
        "examples_level": "single",
        "terminology_level": "technical",
    },
)


def _candidate_key(config: Mapping[str, str]) -> tuple[str, ...]:
    return tuple(config[factor] for factor in FACTOR_NAMES)


def normalize_factor_config(config: Mapping[str, Any]) -> dict[str, str]:
    if not isinstance(config, Mapping):
        raise ValueError("Factor config must be a mapping")

    actual_keys = set(config.keys())
    expected_keys = set(FACTOR_NAMES)
    missing = expected_keys - actual_keys
    extra = actual_keys - expected_keys
    if missing or extra:
        raise ValueError(
            f"Invalid factor keys: missing={sorted(missing)}, extra={sorted(extra)}"
        )

    normalized: dict[str, str] = {}
    for factor in FACTOR_NAMES:
        raw_value = config[factor]
        if not isinstance(raw_value, str):
            raise ValueError(f"{factor} must be a string")
        value = raw_value.strip().lower().replace("-", "_")
        if value not in FACTOR_VALUES[factor]:
            allowed = ", ".join(FACTOR_VALUES[factor])
            raise ValueError(f"Invalid {factor}={raw_value!r}; allowed: {allowed}")
        normalized[factor] = value
    return normalized


def validate_factor_config(config: Mapping[str, Any]) -> bool:
    normalize_factor_config(config)
    return True


def generate_full_factor_grid() -> list[dict[str, str]]:
    return [
        dict(zip(FACTOR_NAMES, values, strict=True))
        for values in product(*(FACTOR_VALUES[factor] for factor in FACTOR_NAMES))
    ]


def _neighbor_candidates(base_config: Mapping[str, str]) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    for factor in FACTOR_NAMES:
        values = FACTOR_VALUES[factor]
        current_index = values.index(base_config[factor])
        for offset in (-1, 1):
            next_index = current_index + offset
            if 0 <= next_index < len(values):
                candidate = dict(base_config)
                candidate[factor] = values[next_index]
                candidates.append(candidate)
    return candidates


def generate_bounded_candidate_set(
    base_config: Mapping[str, Any],
    max_candidates: int = 30,
) -> list[dict[str, str]]:
    if not isinstance(max_candidates, int) or max_candidates < 1:
        raise ValueError("max_candidates must be a positive integer")

    normalized_base = normalize_factor_config(base_config)
    candidates: list[dict[str, str]] = []
    seen: set[tuple[str, ...]] = set()

    def append_unique(config: Mapping[str, Any]) -> None:
        if len(candidates) >= max_candidates:
            return
        normalized = normalize_factor_config(config)
        key = _candidate_key(normalized)
        if key in seen:
            return
        seen.add(key)
        candidates.append(normalized)

    append_unique(normalized_base)
    for candidate in _neighbor_candidates(normalized_base):
        append_unique(candidate)

    append_unique(BASELINE_CONFIG)
    for candidate in EXPLORATION_CONFIGS:
        append_unique(candidate)

    return candidates
