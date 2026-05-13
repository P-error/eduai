from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from eduai_ml.validation import validate_model_artifact

from .simple_scorer import SimpleCandidateScorer


def load_candidate_scorer_artifact(path: str | Path) -> tuple[dict[str, Any], SimpleCandidateScorer]:
    artifact = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(artifact, dict):
        raise ValueError("Artifact must be a JSON object")
    validate_model_artifact(artifact)
    payload = artifact["model"]["weights_or_serialized_payload"]
    if not isinstance(payload, dict):
        raise ValueError("Artifact does not contain JSON scorer payload")
    return artifact, SimpleCandidateScorer.from_payload(payload)
