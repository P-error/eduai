from __future__ import annotations

from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES, generate_full_factor_grid


def test_factor_space_contains_exactly_six_factors() -> None:
    assert FACTOR_NAMES == (
        "difficulty",
        "depth",
        "support_level",
        "presentation_format",
        "examples_level",
        "terminology_level",
    )


def test_factor_values_match_contract() -> None:
    assert FACTOR_VALUES == {
        "difficulty": ("easy", "medium", "hard"),
        "depth": ("brief", "standard", "detailed"),
        "support_level": ("minimal", "guided", "scaffolded"),
        "presentation_format": ("paragraph", "structured_list", "step_by_step", "qa"),
        "examples_level": ("none", "single", "multiple"),
        "terminology_level": ("simple", "balanced", "technical"),
    }


def test_full_grid_has_972_configurations() -> None:
    grid = generate_full_factor_grid()
    assert len(grid) == 972
    assert len({tuple(item.items()) for item in grid}) == 972
