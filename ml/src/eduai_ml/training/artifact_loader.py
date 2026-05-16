from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from eduai_ml.validation import validate_model_artifact

from .constant_scorer import ConstantCandidateScorer
from .simple_scorer import SimpleCandidateScorer
from .tree_scorer import TreeCandidateScorer


def load_candidate_scorer_artifact(
    path: str | Path,
) -> tuple[dict[str, Any], SimpleCandidateScorer | TreeCandidateScorer | ConstantCandidateScorer]:
    artifact = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(artifact, dict):
        raise ValueError("Artifact must be a JSON object")
    validate_model_artifact(artifact)
    payload = artifact["model"]["weights_or_serialized_payload"]
    if not isinstance(payload, dict):
        raise ValueError("Artifact does not contain JSON scorer payload")
    payload_schema_version = str(payload.get("payload_schema_version") or "")
    if payload_schema_version == "linear_candidate_scorer_payload.v1":
        return artifact, SimpleCandidateScorer.from_payload(payload)
    if payload_schema_version == "tree_candidate_scorer_payload.v1":
        return artifact, TreeCandidateScorer.from_payload(payload)
    if payload_schema_version == "constant_candidate_scorer_payload.v1":
        return artifact, ConstantCandidateScorer.from_payload(payload)
    raise ValueError(f"Unsupported scorer payload schema: {payload_schema_version}")
