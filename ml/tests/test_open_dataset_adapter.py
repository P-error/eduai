from __future__ import annotations

from eduai_ml.data.open_dataset_adapter import (
    OpenDatasetAdapter,
    map_open_dataset_row_to_pre_decision_features,
)
from eduai_ml.factor_space import BASELINE_CONFIG


def test_open_dataset_features_exclude_outcome_fields() -> None:
    features = map_open_dataset_row_to_pre_decision_features(
        {
            "student_id": "s1",
            "skill_id": "k1",
            "prior_correct_rate": 0.4,
            "next_step_success": True,
            "post_score": 1.0,
        }
    )
    assert "next_step_success" not in features
    assert "post_score" not in features
    assert features["prior_correct_rate"] == 0.4


def test_open_dataset_adapter_requires_candidate_or_assignment_without_delivered_config() -> None:
    adapter = OpenDatasetAdapter("open_source", "v1")
    result = adapter.build_open_dataset_observation_stub(
        {
            "id": "row1",
            "student_id": "s1",
            "skill_id": "k1",
            "timestamp": "2026-01-01T00:00:00Z",
        }
    )
    assert result.observation is None
    assert result.has_six_factor_causal_evidence is False


def test_open_dataset_adapter_does_not_claim_causal_evidence_for_assigned_candidate() -> None:
    adapter = OpenDatasetAdapter("open_source", "v1")
    result = adapter.build_open_dataset_observation_stub(
        {
            "id": "row1",
            "student_id": "s1",
            "skill_id": "k1",
            "timestamp": "2026-01-01T00:00:00Z",
            "correct": True,
            "attempt_id": "attempt1",
        },
        candidate_config=BASELINE_CONFIG,
    )
    assert result.observation is not None
    assert result.has_six_factor_causal_evidence is False
    assert result.observation["source"]["source_kind"] == "open_dataset"
