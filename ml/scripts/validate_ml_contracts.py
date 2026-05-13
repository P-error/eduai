#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from typing import Callable

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.contracts import (  # noqa: E402
    load_app_inference_features_example,
    load_app_six_factor_decision_example,
    load_factor_space_document,
    load_model_artifact_example,
    load_training_observation_example,
)
from eduai_ml.factor_space import (  # noqa: E402
    BASELINE_CONFIG,
    FACTOR_NAMES,
    FACTOR_SPACE_VERSION,
    FACTOR_VALUES,
    generate_bounded_candidate_set,
    generate_full_factor_grid,
)
from eduai_ml.validation import (  # noqa: E402
    validate_app_inference_features,
    validate_app_six_factor_decision,
    validate_model_artifact,
    validate_training_observation,
)


def _check_factor_space() -> None:
    document = load_factor_space_document()
    if document["factor_space_version"] != FACTOR_SPACE_VERSION:
        raise ValueError("factor_space_version mismatch")
    factors = document["factors"]
    names = tuple(item["name"] for item in factors)
    if names != FACTOR_NAMES:
        raise ValueError(f"factor names mismatch: {names}")
    for item in factors:
        expected_values = list(FACTOR_VALUES[item["name"]])
        if item["values"] != expected_values:
            raise ValueError(f"factor values mismatch for {item['name']}")
    if document["candidate_count"] != 972:
        raise ValueError("candidate_count must be 972")


def _check_training_observation_example() -> None:
    validate_training_observation(load_training_observation_example())


def _check_model_artifact_example() -> None:
    validate_model_artifact(load_model_artifact_example())


def _check_app_inference_examples() -> None:
    validate_app_inference_features(load_app_inference_features_example())
    validate_app_six_factor_decision(load_app_six_factor_decision_example())


def _check_candidate_generation() -> None:
    grid = generate_full_factor_grid()
    if len(grid) != 972:
        raise ValueError(f"full grid size mismatch: {len(grid)}")
    bounded = generate_bounded_candidate_set(BASELINE_CONFIG, max_candidates=30)
    if not bounded:
        raise ValueError("bounded candidate set is empty")
    if bounded[0] != BASELINE_CONFIG:
        raise ValueError("bounded candidate set must start with base config")
    if len(bounded) > 30:
        raise ValueError(f"bounded candidate set too large: {len(bounded)}")
    keys = [tuple(candidate.items()) for candidate in bounded]
    if len(keys) != len(set(keys)):
        raise ValueError("bounded candidate set contains duplicates")
    if bounded != generate_bounded_candidate_set(BASELINE_CONFIG, max_candidates=30):
        raise ValueError("bounded candidate set is not deterministic")


def main() -> int:
    checks: list[tuple[str, Callable[[], None]]] = [
        ("factor_space", _check_factor_space),
        ("training_observation_example", _check_training_observation_example),
        ("model_artifact_example", _check_model_artifact_example),
        ("app_inference_examples", _check_app_inference_examples),
        ("candidate_generation", _check_candidate_generation),
    ]

    failed = False
    for name, check in checks:
        try:
            check()
        except Exception as error:
            failed = True
            print(f"FAIL {name}: {error}")
        else:
            print(f"OK {name}")

    if failed:
        print("SUMMARY FAIL")
        return 1
    print("SUMMARY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
