from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Any, Mapping

from .feature_extraction import extract_features, get_feature_names


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


@dataclass
class ConstantCandidateScorer:
    feature_names: list[str]
    prediction: dict[str, float]
    parameters: dict[str, Any]

    def predict_from_features(self, _features: Mapping[str, float]) -> dict[str, float]:
        return dict(self.prediction)

    def score_observation(self, observation: Mapping[str, Any]) -> dict[str, float]:
        return self.predict_from_features(extract_features(observation))

    def to_payload(self) -> dict[str, Any]:
        return {
            "payload_schema_version": "constant_candidate_scorer_payload.v1",
            "feature_names": self.feature_names,
            "target_names": sorted(self.prediction.keys()),
            "prediction": self.prediction,
            "parameters": self.parameters,
        }

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "ConstantCandidateScorer":
        return cls(
            feature_names=list(payload.get("feature_names") or get_feature_names()),
            prediction={key: float(value) for key, value in dict(payload["prediction"]).items()},
            parameters=dict(payload.get("parameters") or {}),
        )


def train_constant_candidate_scorer(
    target_rows: list[Mapping[str, float]],
    *,
    strategy: str = "mean",
) -> ConstantCandidateScorer:
    if not target_rows:
        raise ValueError("Cannot train constant scorer without target rows")
    target_names = sorted(target_rows[0].keys())
    prediction: dict[str, float] = {}
    for target_name in target_names:
        values = [float(row[target_name]) for row in target_rows if target_name in row]
        if target_name == "expected_next_step_success" and strategy == "majority":
            positive_rate = mean(values)
            prediction[target_name] = 1.0 if positive_rate >= 0.5 else 0.0
        elif target_name == "expected_learning_gain_signed":
            prediction[target_name] = _clamp(mean(values), -1.0, 1.0)
        else:
            prediction[target_name] = _clamp(mean(values))
    if "combined_outcome_score" in prediction:
        prediction["combined_outcome_score"] = _clamp(prediction["combined_outcome_score"])
    return ConstantCandidateScorer(
        feature_names=get_feature_names(),
        prediction={key: round(value, 10) for key, value in prediction.items()},
        parameters={
            "strategy": strategy,
            "uses_external_ml_library": False,
        },
    )
