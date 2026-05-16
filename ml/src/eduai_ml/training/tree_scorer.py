from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import mean
from typing import Any, Mapping, Sequence

from .feature_extraction import extract_features, get_feature_names

TREE_MODEL_VARIANTS = ("random_forest", "extra_trees", "gradient_boosting")


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def _require_sklearn() -> None:
    try:
        import sklearn  # noqa: F401
    except ImportError as error:
        raise RuntimeError(
            'Missing optional dependency "scikit-learn". Install with: python -m pip install -e "ml[train]"'
        ) from error


def _vector_from_features(features: Mapping[str, float], feature_names: Sequence[str]) -> list[float]:
    return [float(features.get(name, 0.0)) for name in feature_names]


def _leaf_value_for_regression(raw_value: Any) -> float:
    if hasattr(raw_value, "ravel"):
        return float(raw_value.ravel()[0])
    value = raw_value
    while isinstance(value, (list, tuple)) and value:
        value = value[0]
    return float(value)


def _leaf_value_for_classifier(raw_value: Any, positive_index: int) -> float:
    values = raw_value.tolist() if hasattr(raw_value, "tolist") else raw_value
    while isinstance(values, list) and len(values) == 1 and isinstance(values[0], list):
        values = values[0]
    total = sum(float(value) for value in values)
    if total <= 0:
        return 0.0
    return float(values[positive_index]) / total


def _export_tree(estimator: Any, *, value_kind: str, positive_index: int = 1) -> dict[str, Any]:
    tree = estimator.tree_
    values: list[float] = []
    for raw_value in tree.value:
        if value_kind == "classifier_probability":
            values.append(_leaf_value_for_classifier(raw_value, positive_index))
        else:
            values.append(_leaf_value_for_regression(raw_value))
    return {
        "children_left": tree.children_left.tolist(),
        "children_right": tree.children_right.tolist(),
        "feature": tree.feature.tolist(),
        "threshold": [float(value) for value in tree.threshold.tolist()],
        "value": [round(float(value), 10) for value in values],
    }


def _predict_tree(tree: Mapping[str, Any], vector: Sequence[float]) -> float:
    node = 0
    children_left = tree["children_left"]
    children_right = tree["children_right"]
    feature = tree["feature"]
    threshold = tree["threshold"]
    values = tree["value"]
    while int(children_left[node]) != -1:
        feature_index = int(feature[node])
        if vector[feature_index] <= float(threshold[node]):
            node = int(children_left[node])
        else:
            node = int(children_right[node])
    return float(values[node])


def _predict_target_model(model_payload: Mapping[str, Any], vector: Sequence[float]) -> float:
    kind = str(model_payload["kind"])
    if kind == "constant":
        return float(model_payload["value"])
    if kind in {"forest_regressor", "forest_classifier"}:
        tree_values = [_predict_tree(tree, vector) for tree in model_payload["trees"]]
        return mean(tree_values) if tree_values else 0.0
    if kind in {"gradient_boosting_regressor", "gradient_boosting_classifier"}:
        raw_prediction = float(model_payload["initial_prediction"])
        learning_rate = float(model_payload["learning_rate"])
        raw_prediction += learning_rate * sum(_predict_tree(tree, vector) for tree in model_payload["trees"])
        if kind == "gradient_boosting_classifier":
            return _sigmoid(raw_prediction)
        return raw_prediction
    raise ValueError(f"Unsupported tree target model kind: {kind}")


def _clip_prediction(target_name: str, value: float) -> float:
    if target_name == "expected_learning_gain_signed":
        return _clamp(value, -1.0, 1.0)
    return _clamp(value)


@dataclass
class TreeCandidateScorer:
    feature_names: list[str]
    target_models: dict[str, dict[str, Any]]
    parameters: dict[str, Any]

    def predict_from_features(self, features: Mapping[str, float]) -> dict[str, float]:
        vector = _vector_from_features(features, self.feature_names)
        return {
            target_name: _clip_prediction(target_name, _predict_target_model(model_payload, vector))
            for target_name, model_payload in self.target_models.items()
        }

    def score_observation(self, observation: Mapping[str, Any]) -> dict[str, float]:
        return self.predict_from_features(extract_features(observation))

    def to_payload(self) -> dict[str, Any]:
        return {
            "payload_schema_version": "tree_candidate_scorer_payload.v1",
            "feature_names": self.feature_names,
            "target_names": sorted(self.target_models.keys()),
            "target_models": self.target_models,
            "parameters": self.parameters,
        }

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "TreeCandidateScorer":
        return cls(
            feature_names=list(payload["feature_names"]),
            target_models={key: dict(value) for key, value in dict(payload["target_models"]).items()},
            parameters=dict(payload.get("parameters") or {}),
        )


def _target_constant_model(values: list[float], target_name: str) -> dict[str, Any]:
    return {
        "kind": "constant",
        "value": round(_clip_prediction(target_name, mean(values)), 10),
    }


def _build_regressor(variant: str, seed: int) -> Any:
    _require_sklearn()
    if variant == "random_forest":
        from sklearn.ensemble import RandomForestRegressor

        return RandomForestRegressor(
            n_estimators=64,
            max_depth=9,
            min_samples_leaf=3,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "extra_trees":
        from sklearn.ensemble import ExtraTreesRegressor

        return ExtraTreesRegressor(
            n_estimators=64,
            max_depth=9,
            min_samples_leaf=3,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "gradient_boosting":
        from sklearn.ensemble import GradientBoostingRegressor

        return GradientBoostingRegressor(
            n_estimators=96,
            learning_rate=0.05,
            max_depth=3,
            random_state=seed,
        )
    raise ValueError(f"Unsupported tree model variant: {variant}")


def _build_classifier(variant: str, seed: int) -> Any:
    _require_sklearn()
    if variant == "random_forest":
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(
            n_estimators=64,
            max_depth=9,
            min_samples_leaf=3,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "extra_trees":
        from sklearn.ensemble import ExtraTreesClassifier

        return ExtraTreesClassifier(
            n_estimators=64,
            max_depth=9,
            min_samples_leaf=3,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "gradient_boosting":
        from sklearn.ensemble import GradientBoostingClassifier

        return GradientBoostingClassifier(
            n_estimators=96,
            learning_rate=0.05,
            max_depth=3,
            random_state=seed,
        )
    raise ValueError(f"Unsupported tree model variant: {variant}")


def _export_regressor(model: Any, variant: str) -> dict[str, Any]:
    if variant in {"random_forest", "extra_trees"}:
        return {
            "kind": "forest_regressor",
            "trees": [
                _export_tree(estimator, value_kind="regression")
                for estimator in model.estimators_
            ],
        }
    initial_prediction = float(model.init_.predict([[0.0] * int(model.n_features_in_)])[0])
    return {
        "kind": "gradient_boosting_regressor",
        "initial_prediction": round(initial_prediction, 10),
        "learning_rate": float(model.learning_rate),
        "trees": [
            _export_tree(estimator, value_kind="regression")
            for estimator in model.estimators_.ravel()
        ],
    }


def _export_classifier(model: Any, variant: str) -> dict[str, Any]:
    classes = [int(value) for value in model.classes_.tolist()]
    if 1 not in classes:
        return {"kind": "constant", "value": 0.0}
    positive_index = classes.index(1)
    if variant in {"random_forest", "extra_trees"}:
        return {
            "kind": "forest_classifier",
            "classes": classes,
            "positive_class": 1,
            "trees": [
                _export_tree(
                    estimator,
                    value_kind="classifier_probability",
                    positive_index=positive_index,
                )
                for estimator in model.estimators_
            ],
        }
    prior = float(model.init_.class_prior_[positive_index])
    prior = _clamp(prior, 1e-9, 1 - 1e-9)
    initial_prediction = math.log(prior / (1 - prior))
    return {
        "kind": "gradient_boosting_classifier",
        "classes": classes,
        "positive_class": 1,
        "initial_prediction": round(initial_prediction, 10),
        "learning_rate": float(model.learning_rate),
        "trees": [
            _export_tree(estimator, value_kind="regression")
            for estimator in model.estimators_.ravel()
        ],
    }


def train_tree_candidate_scorer(
    feature_rows: list[Mapping[str, float]],
    target_rows: list[Mapping[str, float]],
    *,
    variant: str,
    seed: int,
) -> TreeCandidateScorer:
    if variant not in TREE_MODEL_VARIANTS:
        allowed = ", ".join(TREE_MODEL_VARIANTS)
        raise ValueError(f"Unsupported tree model variant: {variant}; allowed: {allowed}")
    if not feature_rows:
        raise ValueError("Cannot train tree scorer without feature rows")
    if len(feature_rows) != len(target_rows):
        raise ValueError("feature_rows and target_rows length mismatch")

    feature_names = get_feature_names()
    x_rows = [_vector_from_features(features, feature_names) for features in feature_rows]
    target_names = sorted(target_rows[0].keys())
    target_models: dict[str, dict[str, Any]] = {}

    for target_name in target_names:
        y_values = [float(row[target_name]) for row in target_rows]
        if target_name == "expected_next_step_success":
            y_classes = [1 if value >= 0.5 else 0 for value in y_values]
            if len(set(y_classes)) < 2:
                target_models[target_name] = _target_constant_model(y_values, target_name)
                continue
            classifier = _build_classifier(variant, seed)
            classifier.fit(x_rows, y_classes)
            target_models[target_name] = _export_classifier(classifier, variant)
            continue

        if len(set(y_values)) < 2:
            target_models[target_name] = _target_constant_model(y_values, target_name)
            continue
        regressor = _build_regressor(variant, seed)
        regressor.fit(x_rows, y_values)
        target_models[target_name] = _export_regressor(regressor, variant)

    return TreeCandidateScorer(
        feature_names=feature_names,
        target_models=target_models,
        parameters={
            "variant": variant,
            "seed": seed,
            "uses_external_ml_library": True,
            "external_ml_library": "scikit-learn",
            "export_format": "json_tree_ensemble",
        },
    )
