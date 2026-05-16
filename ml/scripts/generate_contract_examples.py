#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.contracts import (  # noqa: E402
    MODEL_ARTIFACT_EXAMPLE_PATH,
    TRAINING_OBSERVATION_EXAMPLE_PATH,
)


def training_observation_example() -> dict[str, Any]:
    candidate_config = {
        "difficulty": "medium",
        "depth": "standard",
        "support_level": "guided",
        "presentation_format": "step_by_step",
        "examples_level": "multiple",
        "terminology_level": "balanced",
    }
    return {
        "schema_version": "training_observation.v1",
        "ids": {
            "observation_id": "obs_example_0001",
            "user_ref": "user_example_0001",
            "subject_ref": "subject_math",
            "topic_ref": "topic_linear_equations",
            "session_ref": "session_example_0001",
            "content_event_ref": "content_event_example_0001",
            "test_event_ref": "test_event_example_0001",
        },
        "timestamps": {
            "decision_created_at": "2026-01-15T10:00:00Z",
            "outcome_observed_at": "2026-01-15T10:20:00Z",
        },
        "source": {
            "source_kind": "synthetic",
            "source_name": "eduai_contract_example",
            "source_version": "v1",
            "adapter_version": None,
        },
        "pre_decision_features": {
            "prior_attempts_count": 12,
            "prior_correct_rate": 0.58,
            "recent_correct_rate": 0.5,
            "recent_attempts_count": 4,
            "topic_seen_count": 3,
            "minutes_since_last_activity": 45,
            "session_position": 2,
            "declared_preference_difficulty": "medium",
            "declared_preference_depth": "standard",
            "declared_preference_format": "step_by_step",
        },
        "candidate_config": candidate_config,
        "delivered_config": candidate_config,
        "outcome": {
            "pre_score": 0.4,
            "post_score": 0.7,
            "max_score": 1,
            "next_step_success": True,
            "normalized_learning_gain": 0.5,
            "normalized_learning_gain_clamped": 0.5,
            "outcome_available": True,
        },
        "leakage_guard": {
            "features_cutoff_at": "2026-01-15T10:00:00Z",
            "uses_only_pre_decision_data": True,
            "notes": None,
        },
        "policy_context": {
            "policy_id": None,
            "model_version": None,
            "backend_kind": None,
            "fallback_used": False,
        },
    }


def model_artifact_example() -> dict[str, Any]:
    return {
        "artifact_kind": "eduai_native_pedagogy_artifact",
        "artifact_schema_version": "model_artifact.v1",
        "model_version": "example-untrained-contract-artifact-v1",
        "created_at": "2026-01-15T10:00:00Z",
        "factor_space_version": "factor_space.v1",
        "training_data": {
            "source_summary": "Schema validation example only; no real training data.",
            "observation_count": 1,
            "source_kinds": ["synthetic"],
        },
        "target_definition": {
            "primary_target": "expected_next_step_success",
            "secondary_targets": ["expected_learning_gain_proxy", "uncertainty"],
            "formula_description": "Future scorer estimates outcome from pre-decision features and a complete six-factor candidate_config.",
        },
        "feature_schema": {
            "schema_version": "training_observation.v1",
            "allowed_input_block": "pre_decision_features",
            "forbidden_inputs": [
                "outcome.post_score",
                "outcome.next_step_success",
                "outcome.normalized_learning_gain",
            ],
        },
        "candidate_schema": {
            "factor_space_version": "factor_space.v1",
            "required_factors": [
                "difficulty",
                "depth",
                "support_level",
                "presentation_format",
                "examples_level",
                "terminology_level",
            ],
        },
        "model": {
            "model_family": "untrained_contract_example",
            "parameters": {},
            "weights_or_serialized_payload": None,
        },
        "evaluation": {
            "split_strategy": "not_evaluated_example_only",
            "metrics": {},
            "baseline_comparison": {},
        },
        "compatibility": {
            "app_min_version": None,
            "contract_version": "pedagogy_policy_contract_v1",
        },
        "limitations": [
            "Example artifact only; contains no trained weights.",
            "Must not be used for runtime scoring.",
            "Does not prove six-factor effectiveness.",
        ],
    }


def write_json(path: Path, document: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    write_json(TRAINING_OBSERVATION_EXAMPLE_PATH, training_observation_example())
    write_json(MODEL_ARTIFACT_EXAMPLE_PATH, model_artifact_example())
    print(f"Wrote {TRAINING_OBSERVATION_EXAMPLE_PATH}")
    print(f"Wrote {MODEL_ARTIFACT_EXAMPLE_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
