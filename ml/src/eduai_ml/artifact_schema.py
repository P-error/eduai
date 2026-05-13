from __future__ import annotations

from typing import Any

from .contracts import MODEL_ARTIFACT_SCHEMA_PATH, load_json
from .validation import validate_model_artifact


def load_model_artifact_schema() -> dict[str, Any]:
    return load_json(MODEL_ARTIFACT_SCHEMA_PATH)


__all__ = ["load_model_artifact_schema", "validate_model_artifact"]
