from __future__ import annotations

from pathlib import Path
from typing import Any

from .contracts import (
    MODEL_ARTIFACT_SCHEMA_PATH,
    APP_INFERENCE_FEATURES_SCHEMA_PATH,
    APP_SIX_FACTOR_DECISION_SCHEMA_PATH,
    TRAINING_OBSERVATION_SCHEMA_PATH,
    load_json,
)


def _jsonschema():
    try:
        from jsonschema import Draft202012Validator, FormatChecker
    except ImportError as error:
        raise RuntimeError(
            'Missing dependency "jsonschema". Install with: python -m pip install -e "ml[test]"'
        ) from error
    return Draft202012Validator, FormatChecker


def load_schema(path: Path) -> dict[str, Any]:
    return load_json(path)


def validate_json_document(document: dict[str, Any], schema: dict[str, Any]) -> None:
    Draft202012Validator, FormatChecker = _jsonschema()
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.path))
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.path) or "<root>"
        raise ValueError(f"{location}: {first.message}")


def validate_training_observation(document: dict[str, Any]) -> None:
    validate_json_document(document, load_schema(TRAINING_OBSERVATION_SCHEMA_PATH))


def validate_model_artifact(document: dict[str, Any]) -> None:
    validate_json_document(document, load_schema(MODEL_ARTIFACT_SCHEMA_PATH))


def validate_app_inference_features(document: dict[str, Any]) -> None:
    validate_json_document(document, load_schema(APP_INFERENCE_FEATURES_SCHEMA_PATH))


def validate_app_six_factor_decision(document: dict[str, Any]) -> None:
    validate_json_document(document, load_schema(APP_SIX_FACTOR_DECISION_SCHEMA_PATH))
