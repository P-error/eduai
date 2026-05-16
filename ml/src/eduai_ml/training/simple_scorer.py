from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Mapping

from .feature_extraction import extract_features, get_feature_names

TARGET_NAMES = (
    "expected_learning_gain_proxy",
    "expected_learning_gain_signed",
    "expected_next_step_success",
    "combined_outcome_score",
)


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def _dot(weights: list[float], vector: list[float]) -> float:
    return sum(weight * value for weight, value in zip(weights, vector, strict=True))


def features_to_vector(features: Mapping[str, float], feature_names: list[str] | None = None) -> list[float]:
    names = feature_names or get_feature_names()
    return [1.0] + [float(features.get(name, 0.0)) for name in names]


@dataclass
class SimpleCandidateScorer:
    feature_names: list[str]
    learning_gain_weights: list[float]
    success_logit_weights: list[float]
    combined_score_weights: list[float]
    parameters: dict[str, Any]
    learning_gain_signed_weights: list[float] | None = None

    def predict_from_features(self, features: Mapping[str, float]) -> dict[str, float]:
        vector = features_to_vector(features, self.feature_names)
        learning_gain = _clamp(_dot(self.learning_gain_weights, vector))
        success_probability = _clamp(_sigmoid(_dot(self.success_logit_weights, vector)))
        combined = _clamp(_dot(self.combined_score_weights, vector))
        prediction = {
            "expected_learning_gain_proxy": learning_gain,
            "expected_next_step_success": success_probability,
            "combined_outcome_score": combined,
        }
        if self.learning_gain_signed_weights is not None:
            prediction["expected_learning_gain_signed"] = _clamp(
                _dot(self.learning_gain_signed_weights, vector),
                -1.0,
                1.0,
            )
        return prediction

    def score_observation(self, observation: Mapping[str, Any]) -> dict[str, float]:
        return self.predict_from_features(extract_features(observation))

    def to_payload(self) -> dict[str, Any]:
        return {
            "payload_schema_version": "linear_candidate_scorer_payload.v1",
            "feature_names": self.feature_names,
            "target_names": [
                name
                for name in TARGET_NAMES
                if name != "expected_learning_gain_signed" or self.learning_gain_signed_weights is not None
            ],
            "weights": {
                "expected_learning_gain_proxy": self.learning_gain_weights,
                "expected_next_step_success_logit": self.success_logit_weights,
                "combined_outcome_score": self.combined_score_weights,
                **(
                    {"expected_learning_gain_signed": self.learning_gain_signed_weights}
                    if self.learning_gain_signed_weights is not None
                    else {}
                ),
            },
            "parameters": self.parameters,
        }

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "SimpleCandidateScorer":
        weights = payload.get("weights", {})
        return cls(
            feature_names=list(payload["feature_names"]),
            learning_gain_weights=[float(value) for value in weights["expected_learning_gain_proxy"]],
            success_logit_weights=[float(value) for value in weights["expected_next_step_success_logit"]],
            combined_score_weights=[float(value) for value in weights["combined_outcome_score"]],
            parameters=dict(payload.get("parameters") or {}),
            learning_gain_signed_weights=(
                [float(value) for value in weights["expected_learning_gain_signed"]]
                if "expected_learning_gain_signed" in weights
                else None
            ),
        )


def train_simple_candidate_scorer(
    feature_rows: list[Mapping[str, float]],
    target_rows: list[Mapping[str, float]],
    *,
    epochs: int = 700,
    learning_rate: float = 0.08,
    l2: float = 0.001,
) -> SimpleCandidateScorer:
    if not feature_rows:
        raise ValueError("Cannot train scorer without feature rows")
    if len(feature_rows) != len(target_rows):
        raise ValueError("feature_rows and target_rows length mismatch")

    feature_names = get_feature_names()
    vectors = [features_to_vector(features, feature_names) for features in feature_rows]
    target_gain = [float(target["expected_learning_gain_proxy"]) for target in target_rows]
    target_signed_gain = [
        float(target["expected_learning_gain_signed"])
        for target in target_rows
        if "expected_learning_gain_signed" in target
    ]
    target_success = [float(target["expected_next_step_success"]) for target in target_rows]
    target_combined = [float(target["combined_outcome_score"]) for target in target_rows]
    width = len(vectors[0])
    n_rows = len(vectors)

    gain_weights = [0.0] * width
    signed_gain_weights = [0.0] * width if len(target_signed_gain) == len(target_rows) else None
    success_weights = [0.0] * width
    combined_weights = [0.0] * width

    def update_linear(weights: list[float], targets: list[float]) -> None:
        gradients = [0.0] * width
        for vector, target in zip(vectors, targets, strict=True):
            error = _dot(weights, vector) - target
            for index, value in enumerate(vector):
                gradients[index] += error * value
        for index in range(width):
            regularization = 0.0 if index == 0 else l2 * weights[index]
            weights[index] -= learning_rate * ((gradients[index] / n_rows) + regularization)

    def update_logistic(weights: list[float], targets: list[float]) -> None:
        gradients = [0.0] * width
        for vector, target in zip(vectors, targets, strict=True):
            error = _sigmoid(_dot(weights, vector)) - target
            for index, value in enumerate(vector):
                gradients[index] += error * value
        for index in range(width):
            regularization = 0.0 if index == 0 else l2 * weights[index]
            weights[index] -= learning_rate * ((gradients[index] / n_rows) + regularization)

    for _ in range(epochs):
        update_linear(gain_weights, target_gain)
        if signed_gain_weights is not None:
            update_linear(signed_gain_weights, target_signed_gain)
        update_logistic(success_weights, target_success)
        update_linear(combined_weights, target_combined)

    parameters = {
        "optimizer": "batch_gradient_descent",
        "epochs": epochs,
        "learning_rate": learning_rate,
        "l2": l2,
        "uses_external_ml_library": False,
    }
    return SimpleCandidateScorer(
        feature_names=feature_names,
        learning_gain_weights=[round(value, 10) for value in gain_weights],
        success_logit_weights=[round(value, 10) for value in success_weights],
        combined_score_weights=[round(value, 10) for value in combined_weights],
        parameters=parameters,
        learning_gain_signed_weights=(
            [round(value, 10) for value in signed_gain_weights]
            if signed_gain_weights is not None
            else None
        ),
    )
