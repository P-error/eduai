from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ML_ROOT = Path(__file__).resolve().parents[2]
SCHEMAS_DIR = ML_ROOT / "schemas"
EXAMPLES_DIR = ML_ROOT / "examples"

FACTOR_SPACE_SCHEMA_PATH = SCHEMAS_DIR / "factor_space.v1.json"
TRAINING_OBSERVATION_SCHEMA_PATH = SCHEMAS_DIR / "training_observation.v1.schema.json"
MODEL_ARTIFACT_SCHEMA_PATH = SCHEMAS_DIR / "model_artifact.v1.schema.json"
APP_INFERENCE_FEATURES_SCHEMA_PATH = SCHEMAS_DIR / "app_inference_features.v1.schema.json"
APP_SIX_FACTOR_DECISION_SCHEMA_PATH = SCHEMAS_DIR / "app_six_factor_decision.v1.schema.json"

TRAINING_OBSERVATION_EXAMPLE_PATH = EXAMPLES_DIR / "training_observation.example.json"
MODEL_ARTIFACT_EXAMPLE_PATH = EXAMPLES_DIR / "model_artifact.example.json"
APP_INFERENCE_FEATURES_EXAMPLE_PATH = EXAMPLES_DIR / "app_inference_features.example.json"
APP_SIX_FACTOR_DECISION_EXAMPLE_PATH = EXAMPLES_DIR / "app_six_factor_decision.example.json"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return data


def load_factor_space_document() -> dict[str, Any]:
    return load_json(FACTOR_SPACE_SCHEMA_PATH)


def load_training_observation_example() -> dict[str, Any]:
    return load_json(TRAINING_OBSERVATION_EXAMPLE_PATH)


def load_model_artifact_example() -> dict[str, Any]:
    return load_json(MODEL_ARTIFACT_EXAMPLE_PATH)


def load_app_inference_features_example() -> dict[str, Any]:
    return load_json(APP_INFERENCE_FEATURES_EXAMPLE_PATH)


def load_app_six_factor_decision_example() -> dict[str, Any]:
    return load_json(APP_SIX_FACTOR_DECISION_EXAMPLE_PATH)
