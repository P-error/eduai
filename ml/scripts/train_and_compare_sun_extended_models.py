#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import signal
import sys
import time
import warnings
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Mapping, Sequence

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    OUTCOME_FIELD_NAMES,
    load_jsonl_dataset,
    summarize_observations,
    supervised_training_readiness,
    validate_observation_record,
)
from eduai_ml.data.splits import split_records_by_strategy  # noqa: E402
from eduai_ml.training.artifact_writer import build_model_artifact, write_model_artifact  # noqa: E402
from eduai_ml.training.evaluator import evaluate_candidate_scorer  # noqa: E402
from eduai_ml.training.feature_extraction import extract_features, get_feature_names  # noqa: E402
from eduai_ml.training.target_builder import TARGET_SCHEMA_V2, build_targets  # noqa: E402
from eduai_ml.training.trainer import TrainingResult, train_candidate_scorer  # noqa: E402
from eduai_ml.training.tree_scorer import TREE_MODEL_VARIANTS  # noqa: E402
from process_sun_training_dataset import sequential_consistency  # noqa: E402


TARGET_NAMES = (
    "expected_learning_gain_proxy",
    "expected_learning_gain_signed",
    "expected_next_step_success",
    "combined_outcome_score",
)
PRIMARY_SPLIT = "user_id_hash"
SUPPORTED_TS_MODEL_FAMILIES = ("linear_candidate_scorer_v1",)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and compare extended SUN scorer model zoo.")
    parser.add_argument(
        "--input",
        default="ml/src/eduai_ml/training/SUN/merged/sun_training_observations_merged_v1.jsonl",
    )
    parser.add_argument(
        "--extended-artifacts-dir",
        default="ml/src/eduai_ml/training/SUN/artifacts/extended_models",
    )
    parser.add_argument(
        "--extended-reports-dir",
        default="ml/src/eduai_ml/training/SUN/artifacts/extended_reports",
    )
    parser.add_argument(
        "--current-models-dir",
        default="ml/src/eduai_ml/training/SUN/artifacts/models",
    )
    parser.add_argument(
        "--current-reports-dir",
        default="ml/src/eduai_ml/training/SUN/artifacts/reports",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--model-timeout-seconds", type=int, default=90)
    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(payload), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def read_jsonl_strict(path: Path) -> tuple[list[dict[str, Any]], list[str], int]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    empty_lines = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            empty_lines += 1
            errors.append(f"line {line_number}: empty line")
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as error:
            errors.append(f"line {line_number}: invalid JSON: {error}")
            continue
        if not isinstance(parsed, dict):
            errors.append(f"line {line_number}: expected JSON object")
            continue
        records.append(parsed)
    return records, errors, empty_lines


def dependency_versions() -> dict[str, Any]:
    modules = ("sklearn", "numpy", "scipy", "joblib", "pandas", "xgboost", "lightgbm", "catboost")
    result: dict[str, Any] = {}
    for module_name in modules:
        try:
            module = __import__(module_name)
        except ImportError as error:
            result[module_name] = {"available": False, "error": str(error)}
            continue
        result[module_name] = {
            "available": True,
            "version": str(getattr(module, "__version__", "unknown")),
        }
    return result


def detect_runtime_support() -> dict[str, Any]:
    loader_path = REPO_ROOT / "src/lib/ml-six-factor-artifact-loader.ts"
    source = loader_path.read_text(encoding="utf-8") if loader_path.exists() else ""
    supports_linear = (
        "linear_candidate_scorer_v1" in source
        and "linear_candidate_scorer_payload.v1" in source
    )
    rejects_tree = "tree_candidate_scorer_v1 artifacts are currently offline-only" in source
    return {
        "loader_path": str(loader_path),
        "supported_model_families": list(SUPPORTED_TS_MODEL_FAMILIES) if supports_linear else [],
        "supported_payload_schema_versions": ["linear_candidate_scorer_payload.v1"] if supports_linear else [],
        "tree_candidate_scorer_v1_runtime_ready": False,
        "tree_rejection_warning_present": rejects_tree,
    }


def current_artifact_paths(models_dir: Path, reports_dir: Path, dataset_path: Path) -> dict[str, dict[str, Any]]:
    paths = {
        "merged_dataset": dataset_path,
        "best_offline_artifact": models_dir / "sun_best_offline_candidate_scorer_seed42.json",
        "best_runtime_compatible_artifact": models_dir / "sun_best_runtime_linear_candidate_scorer_seed42.json",
        "comparison_json": reports_dir / "sun_candidate_scorer_model_comparison_seed42.json",
        "comparison_markdown": reports_dir / "sun_candidate_scorer_model_comparison_seed42.md",
        "diagnostics": reports_dir / "sun_training_observation_diagnostics.json",
        "final_report": reports_dir / "codex_report_sun_training.md",
    }
    return {
        name: {"path": str(path), "exists": path.exists(), "size_bytes": path.stat().st_size if path.exists() else None}
        for name, path in paths.items()
    }


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def _vector_from_features(features: Mapping[str, float], feature_names: Sequence[str]) -> list[float]:
    return [float(features.get(name, 0.0)) for name in feature_names]


def _safe_float(value: Any, default: float = math.inf) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _json_safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if hasattr(value, "tolist"):
        try:
            return _json_safe(value.tolist())
        except Exception:
            pass
    if isinstance(value, Mapping):
        return {str(key): _json_safe(entry) for key, entry in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(entry) for entry in value]
    return str(value)


def _estimator_core(estimator: Any) -> Any:
    if hasattr(estimator, "named_steps"):
        steps = list(estimator.named_steps.values())
        return steps[-1] if steps else estimator
    return estimator


def _linear_summary(estimator: Any) -> dict[str, Any] | None:
    core = _estimator_core(estimator)
    if not hasattr(core, "coef_"):
        return None
    return {
        "estimator_class": type(estimator).__name__,
        "core_estimator_class": type(core).__name__,
        "coef": _json_safe(getattr(core, "coef_", None)),
        "intercept": _json_safe(getattr(core, "intercept_", None)),
        "classes": _json_safe(getattr(core, "classes_", None)),
    }


def _clip_prediction(target_name: str, value: float) -> float:
    if target_name == "expected_learning_gain_signed":
        return _clamp(value, -1.0, 1.0)
    return _clamp(value)


def _positive_probability(model: Any, vector: Sequence[float]) -> tuple[float, str]:
    x_rows = [list(vector)]
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(x_rows)[0]
        classes = [int(value) for value in getattr(model, "classes_", [0, 1])]
        if 1 in classes:
            return _clamp(float(probabilities[classes.index(1)])), "predict_proba"
        return 0.0, "predict_proba_without_positive_class"
    if hasattr(model, "decision_function"):
        decision = model.decision_function(x_rows)
        if hasattr(decision, "ravel"):
            raw = float(decision.ravel()[0])
        elif isinstance(decision, (list, tuple)):
            raw = float(decision[0])
        else:
            raw = float(decision)
        return _clamp(_sigmoid(raw)), "decision_function_sigmoid_fallback"
    prediction = model.predict(x_rows)[0]
    return 1.0 if int(prediction) == 1 else 0.0, "hard_prediction_probability_fallback"


@dataclass
class ExtendedSklearnCandidateScorer:
    feature_names: list[str]
    target_models: dict[str, Any]
    parameters: dict[str, Any]
    probability_methods: dict[str, str]
    warnings: list[str]

    def predict_from_features(self, features: Mapping[str, float]) -> dict[str, float]:
        vector = _vector_from_features(features, self.feature_names)
        predictions: dict[str, float] = {}
        for target_name, model in self.target_models.items():
            if target_name == "expected_next_step_success":
                probability, _method = _positive_probability(model, vector)
                predictions[target_name] = probability
                continue
            raw = model.predict([vector])[0]
            predictions[target_name] = _clip_prediction(target_name, float(raw))
        return predictions

    def score_observation(self, observation: Mapping[str, Any]) -> dict[str, float]:
        return self.predict_from_features(extract_features(observation))

    def to_payload(self) -> dict[str, Any]:
        target_summaries: dict[str, Any] = {}
        full_linear_payload = True
        for target_name, model in self.target_models.items():
            linear_summary = _linear_summary(model)
            if linear_summary is None:
                full_linear_payload = False
            target_summaries[target_name] = {
                "estimator_class": type(model).__name__,
                "core_estimator_class": type(_estimator_core(model)).__name__,
                "params": _json_safe(model.get_params(deep=False)) if hasattr(model, "get_params") else {},
                "linear_summary": linear_summary,
            }
        return {
            "payload_schema_version": "sklearn_candidate_scorer_payload.v1",
            "feature_names": self.feature_names,
            "target_names": list(TARGET_NAMES),
            "variant": self.parameters.get("variant"),
            "target_model_summaries": target_summaries,
            "probability_methods": dict(self.probability_methods),
            "full_json_prediction_payload": full_linear_payload,
            "runtime_compatible": False,
            "warnings": list(self.warnings),
            "note": (
                "This payload is audit metadata for extended offline comparison. "
                "The current Python artifact loader and TypeScript runtime do not execute sklearn_candidate_scorer_payload.v1."
            ),
        }


def _build_regressor(variant: str, seed: int, train_size: int) -> Any:
    if variant == "hist_gradient_boosting":
        from sklearn.ensemble import HistGradientBoostingRegressor

        return HistGradientBoostingRegressor(
            max_iter=50,
            learning_rate=0.07,
            max_leaf_nodes=31,
            l2_regularization=0.01,
            random_state=seed,
        )
    if variant == "ada_boost":
        from sklearn.ensemble import AdaBoostRegressor
        from sklearn.tree import DecisionTreeRegressor

        return AdaBoostRegressor(
            estimator=DecisionTreeRegressor(max_depth=3, min_samples_leaf=5, random_state=seed),
            n_estimators=40,
            learning_rate=0.05,
            random_state=seed,
        )
    if variant == "bagging":
        from sklearn.ensemble import BaggingRegressor
        from sklearn.tree import DecisionTreeRegressor

        return BaggingRegressor(
            estimator=DecisionTreeRegressor(max_depth=9, min_samples_leaf=3, random_state=seed),
            n_estimators=24,
            max_samples=0.85,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "ridge":
        from sklearn.linear_model import Ridge

        return Ridge(alpha=1.0, random_state=seed)
    if variant == "elastic_net":
        from sklearn.linear_model import ElasticNet

        return ElasticNet(alpha=0.001, l1_ratio=0.35, max_iter=5000, random_state=seed)
    if variant == "k_neighbors":
        from sklearn.neighbors import KNeighborsRegressor

        return KNeighborsRegressor(n_neighbors=max(3, min(25, train_size)), weights="distance")
    if variant == "linear_support_vector":
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.svm import LinearSVR

        return make_pipeline(
            StandardScaler(),
            LinearSVR(C=0.8, epsilon=0.01, max_iter=1500, random_state=seed),
        )
    if variant == "shallow_mlp":
        from sklearn.neural_network import MLPRegressor

        return MLPRegressor(
            hidden_layer_sizes=(24,),
            activation="relu",
            alpha=0.001,
            learning_rate_init=0.005,
            max_iter=120,
            early_stopping=True,
            random_state=seed,
        )
    raise ValueError(f"Unsupported extended regressor variant: {variant}")


def _build_classifier(variant: str, seed: int, train_size: int) -> Any:
    if variant == "hist_gradient_boosting":
        from sklearn.ensemble import HistGradientBoostingClassifier

        return HistGradientBoostingClassifier(
            max_iter=50,
            learning_rate=0.07,
            max_leaf_nodes=31,
            l2_regularization=0.01,
            random_state=seed,
        )
    if variant == "ada_boost":
        from sklearn.ensemble import AdaBoostClassifier
        from sklearn.tree import DecisionTreeClassifier

        return AdaBoostClassifier(
            estimator=DecisionTreeClassifier(max_depth=3, min_samples_leaf=5, random_state=seed),
            n_estimators=40,
            learning_rate=0.05,
            random_state=seed,
        )
    if variant == "bagging":
        from sklearn.ensemble import BaggingClassifier
        from sklearn.tree import DecisionTreeClassifier

        return BaggingClassifier(
            estimator=DecisionTreeClassifier(max_depth=9, min_samples_leaf=3, random_state=seed),
            n_estimators=24,
            max_samples=0.85,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "ridge":
        from sklearn.linear_model import RidgeClassifier

        return RidgeClassifier(alpha=1.0)
    if variant == "elastic_net":
        from sklearn.linear_model import LogisticRegression

        return LogisticRegression(
            penalty="elasticnet",
            solver="saga",
            l1_ratio=0.35,
            C=2.0,
            max_iter=2000,
            random_state=seed,
            n_jobs=1,
        )
    if variant == "k_neighbors":
        from sklearn.neighbors import KNeighborsClassifier

        return KNeighborsClassifier(n_neighbors=max(3, min(25, train_size)), weights="distance")
    if variant == "linear_support_vector":
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
        from sklearn.svm import LinearSVC

        return make_pipeline(
            StandardScaler(),
            LinearSVC(C=0.8, max_iter=1500, random_state=seed),
        )
    if variant == "shallow_mlp":
        from sklearn.neural_network import MLPClassifier

        return MLPClassifier(
            hidden_layer_sizes=(24,),
            activation="relu",
            alpha=0.001,
            learning_rate_init=0.005,
            max_iter=120,
            early_stopping=True,
            random_state=seed,
        )
    raise ValueError(f"Unsupported extended classifier variant: {variant}")


def _fit_constant_model(target_name: str, values: list[float]) -> Any:
    if target_name == "expected_next_step_success":
        from sklearn.dummy import DummyClassifier

        constant = 1 if mean(values) >= 0.5 else 0
        model = DummyClassifier(strategy="constant", constant=constant)
        model.fit([[0.0]], [constant])
        return model
    from sklearn.dummy import DummyRegressor

    model = DummyRegressor(strategy="mean")
    model.fit([[0.0] for _ in values], values)
    return model


def train_extended_sklearn_scorer(
    train_records: list[Mapping[str, Any]],
    *,
    variant: str,
    seed: int,
) -> ExtendedSklearnCandidateScorer:
    feature_names = get_feature_names()
    x_rows: list[list[float]] = []
    target_rows: list[dict[str, float]] = []
    for record in train_records:
        targets = build_targets(record, target_schema_version=TARGET_SCHEMA_V2)
        x_rows.append(_vector_from_features(extract_features(record), feature_names))
        target_rows.append(targets)

    if not x_rows:
        raise ValueError("Cannot train extended sklearn scorer without feature rows")

    target_models: dict[str, Any] = {}
    probability_methods: dict[str, str] = {}
    model_warnings: list[str] = []
    for target_name in TARGET_NAMES:
        y_values = [float(row[target_name]) for row in target_rows]
        if len(set(y_values)) < 2:
            model = _fit_constant_model(target_name, y_values)
            target_models[target_name] = model
            probability_methods[target_name] = "constant"
            continue

        if target_name == "expected_next_step_success":
            y_classes = [1 if value >= 0.5 else 0 for value in y_values]
            model = _build_classifier(variant, seed, len(x_rows))
            model.fit(x_rows, y_classes)
            _, probability_method = _positive_probability(model, x_rows[0])
            probability_methods[target_name] = probability_method
            if probability_method != "predict_proba":
                model_warnings.append(
                    f"{variant}: expected_next_step_success uses {probability_method}; probability is not calibrated."
                )
            target_models[target_name] = model
            continue

        model = _build_regressor(variant, seed, len(x_rows))
        model.fit(x_rows, y_values)
        target_models[target_name] = model

    return ExtendedSklearnCandidateScorer(
        feature_names=feature_names,
        target_models=target_models,
        parameters={
            "variant": variant,
            "seed": seed,
            "uses_external_ml_library": True,
            "external_ml_library": "scikit-learn",
            "runtime_compatible": False,
        },
        probability_methods=probability_methods,
        warnings=sorted(set(model_warnings)),
    )


def test_metric_row(
    *,
    model_family: str,
    model_variant: str | None,
    split_strategy: str,
    evaluation_report: Mapping[str, Any],
    skipped_rows: int,
    training_time_seconds: float,
    training_warnings: list[str],
    runtime_integration_rank: int,
    export_status: Mapping[str, Any],
) -> dict[str, Any]:
    test_metrics = evaluation_report["model_metrics"]["test"]
    success_metrics = test_metrics["expected_next_step_success"]
    signed_gain = test_metrics["expected_learning_gain_signed"]
    clamped_gain = test_metrics["expected_learning_gain_proxy"]
    combined = test_metrics["combined_outcome_score"]
    train_combined = evaluation_report["model_metrics"]["train"]["combined_outcome_score"]
    gap = (
        round(combined["rmse"] - train_combined["rmse"], 6)
        if combined["rmse"] is not None and train_combined["rmse"] is not None
        else None
    )
    warnings_set = set(str(warning) for warning in training_warnings)
    warnings_set.update(str(warning) for warning in success_metrics.get("warnings", []))
    warnings_set.update(str(warning) for warning in evaluation_report.get("class_balance", {}).get("test", {}).get("warnings", []))
    return {
        "model_family": model_family,
        "model_variant": model_variant,
        "model_label": model_label({"model_family": model_family, "model_variant": model_variant}),
        "split_strategy": split_strategy,
        "target_schema_version": evaluation_report["target_schema_version"],
        "train_rows": evaluation_report["split_sizes"]["train"],
        "validation_rows": evaluation_report["split_sizes"]["validation"],
        "test_rows": evaluation_report["split_sizes"]["test"],
        "signed_gain_mae": signed_gain["mae"],
        "signed_gain_rmse": signed_gain["rmse"],
        "clamped_gain_mae": clamped_gain["mae"],
        "clamped_gain_rmse": clamped_gain["rmse"],
        "combined_outcome_score_mae": combined["mae"],
        "combined_outcome_score_rmse": combined["rmse"],
        "next_step_success_accuracy": success_metrics["accuracy"],
        "next_step_success_balanced_accuracy": success_metrics["balanced_accuracy"],
        "next_step_success_log_loss": success_metrics["log_loss"],
        "majority_class_accuracy": success_metrics["majority_class_accuracy"],
        "positive_rate": success_metrics["positive_rate"],
        "train_combined_rmse": train_combined["rmse"],
        "combined_rmse_generalization_gap": gap,
        "combined_rmse_generalization_gap_abs": round(abs(gap), 6) if gap is not None else None,
        "training_time_seconds": round(training_time_seconds, 3),
        "warnings": sorted(warnings_set),
        "skipped_rows": skipped_rows,
        "runtime_compatible_now": model_family in SUPPORTED_TS_MODEL_FAMILIES,
        "runtime_integration_rank": runtime_integration_rank,
        "export_status": dict(export_status),
    }


def model_label(row: Mapping[str, Any]) -> str:
    variant = row.get("model_variant")
    family = str(row["model_family"])
    return family if not variant else f"{family}:{variant}"


def runtime_integration_rank(model_family: str, model_variant: str | None) -> int:
    if model_family == "linear_candidate_scorer_v1":
        return 0
    if model_family == "tree_candidate_scorer_v1":
        return 1
    if model_variant in {"ridge", "elastic_net", "linear_support_vector"}:
        return 2
    return 3


def export_status_for(model_family: str, model_variant: str | None) -> dict[str, Any]:
    if model_family in {"linear_candidate_scorer_v1", "tree_candidate_scorer_v1", "dummy_candidate_scorer_v1"}:
        return {
            "current_model_artifact_exportable": True,
            "python_artifact_loader_supported": True,
            "typescript_runtime_supported": model_family == "linear_candidate_scorer_v1",
            "reason": "existing EduAI scorer payload",
        }
    if model_variant in {"ridge", "elastic_net", "linear_support_vector"}:
        return {
            "current_model_artifact_exportable": False,
            "python_artifact_loader_supported": False,
            "typescript_runtime_supported": False,
            "reason": "coefficients can be summarized in JSON, but no current EduAI artifact loader/runtime executes sklearn_candidate_scorer_payload.v1",
        }
    return {
        "current_model_artifact_exportable": False,
        "python_artifact_loader_supported": False,
        "typescript_runtime_supported": False,
        "reason": "sklearn estimator is not exported as a current executable JSON scorer payload",
    }


def selection_key(row: Mapping[str, Any]) -> tuple[float, float, float, float, int]:
    return (
        _safe_float(row.get("combined_outcome_score_rmse")),
        _safe_float(row.get("signed_gain_rmse")),
        _safe_float(row.get("next_step_success_log_loss")),
        _safe_float(row.get("combined_rmse_generalization_gap_abs")),
        int(row.get("runtime_integration_rank", 99)),
    )


def train_one_spec(
    records: list[dict[str, Any]],
    *,
    model_family: str,
    model_variant: str | None,
    split_strategy: str,
    seed: int,
    train_ratio: float,
    validation_ratio: float,
    test_ratio: float,
) -> tuple[Any, dict[str, Any], int, float, list[str]]:
    started = time.perf_counter()
    training_warnings: list[str] = []
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        if model_family in {"dummy_candidate_scorer_v1", "linear_candidate_scorer_v1", "tree_candidate_scorer_v1"}:
            result: TrainingResult = train_candidate_scorer(
                records,
                seed=seed,
                train_ratio=train_ratio,
                validation_ratio=validation_ratio,
                test_ratio=test_ratio,
                model_family=model_family,
                model_variant=model_variant,
                split_strategy=split_strategy,
                target_schema_version=TARGET_SCHEMA_V2,
                include_policy_diagnostics=False,
                build_artifact=False,
            )
            scorer = result.scorer
            evaluation_report = result.evaluation_report
            skipped_rows = result.skipped_rows
        else:
            split_records = split_records_by_strategy(
                records,
                train_ratio=train_ratio,
                validation_ratio=validation_ratio,
                seed=seed,
                split_strategy=split_strategy,
            )
            scorer = train_extended_sklearn_scorer(
                list(split_records["train"]),
                variant=str(model_variant),
                seed=seed,
            )
            evaluation_report = evaluate_candidate_scorer(
                records,
                scorer,
                seed=seed,
                train_ratio=train_ratio,
                validation_ratio=validation_ratio,
                split_strategy=split_strategy,
                target_schema_version=TARGET_SCHEMA_V2,
                include_policy_diagnostics=False,
            )
            skipped_rows = 0
            training_warnings.extend(scorer.warnings)
        training_warnings.extend(
            sorted({f"{type(warning.message).__name__}: {warning.message}" for warning in caught})
        )
    return scorer, evaluation_report, skipped_rows, time.perf_counter() - started, training_warnings


def _timeout_handler(_signum: int, _frame: Any) -> None:
    raise TimeoutError("model training exceeded per-model timeout")


def timeout_for_model(base_timeout_seconds: int, model_family: str, model_variant: str | None) -> int:
    if model_family == "dummy_candidate_scorer_v1":
        return max(20, base_timeout_seconds)
    if model_family == "linear_candidate_scorer_v1":
        return max(180, base_timeout_seconds)
    if model_family == "tree_candidate_scorer_v1":
        return max(120, base_timeout_seconds)
    if model_variant in {"shallow_mlp", "linear_support_vector", "k_neighbors"}:
        return base_timeout_seconds
    return max(75, base_timeout_seconds)


def train_one_spec_with_timeout(
    records: list[dict[str, Any]],
    *,
    timeout_seconds: int,
    model_family: str,
    model_variant: str | None,
    split_strategy: str,
    seed: int,
    train_ratio: float,
    validation_ratio: float,
    test_ratio: float,
) -> tuple[Any, dict[str, Any], int, float, list[str]]:
    old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(max(1, timeout_seconds))
    try:
        return train_one_spec(
            records,
            model_family=model_family,
            model_variant=model_variant,
            split_strategy=split_strategy,
            seed=seed,
            train_ratio=train_ratio,
            validation_ratio=validation_ratio,
            test_ratio=test_ratio,
        )
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


def validate_dataset_contract(records: list[dict[str, Any]], strict_errors: list[str], empty_line_count: int) -> dict[str, Any]:
    validation_errors: list[str] = list(strict_errors)
    duplicate_ids: list[str] = []
    candidate_mismatches: list[str] = []
    leakage_errors: list[str] = []
    target_errors: list[str] = []
    signed_gains: list[float] = []
    observation_ids: set[str] = set()
    readiness_counter: Counter[str] = Counter()

    for index, record in enumerate(records, start=1):
        label = f"line {index}"
        try:
            validate_observation_record(record)
        except Exception as error:
            validation_errors.append(f"{label}: {error}")
            continue

        ids = record.get("ids", {})
        observation_id = str(ids.get("observation_id") or "") if isinstance(ids, Mapping) else ""
        if not observation_id:
            validation_errors.append(f"{label}: missing observation_id")
        elif observation_id in observation_ids:
            duplicate_ids.append(observation_id)
        observation_ids.add(observation_id)

        if record.get("candidate_config") != record.get("delivered_config"):
            candidate_mismatches.append(observation_id or label)

        features = record.get("pre_decision_features", {})
        leaked_fields = sorted(set(features.keys()) & OUTCOME_FIELD_NAMES) if isinstance(features, Mapping) else []
        guard_ok = record.get("leakage_guard", {}).get("uses_only_pre_decision_data") is True
        if leaked_fields or not guard_ok:
            leakage_errors.append(f"{observation_id or label}: leaked_fields={leaked_fields}; guard_ok={guard_ok}")

        readiness = supervised_training_readiness(record)
        readiness_counter["supervised_usable" if readiness.usable else str(readiness.reason)] += 1
        try:
            build_targets(record, target_schema_version=TARGET_SCHEMA_V2)
        except Exception as error:
            target_errors.append(f"{observation_id or label}: {error}")

        outcome = record.get("outcome", {})
        gain = outcome.get("normalized_learning_gain") if isinstance(outcome, Mapping) else None
        if isinstance(gain, (int, float)):
            signed_gains.append(float(gain))

    sequential = sequential_consistency(records)
    signed_range_ok = bool(signed_gains) and min(signed_gains) >= -1.0 and max(signed_gains) <= 1.0
    status = "passed" if not (
        validation_errors
        or empty_line_count
        or duplicate_ids
        or candidate_mismatches
        or leakage_errors
        or target_errors
        or not signed_range_ok
        or sequential["status"] != "passed"
    ) else "failed"
    return {
        "status": status,
        "row_count": len(records),
        "empty_line_count": empty_line_count,
        "schema_validation_error_count": len(validation_errors),
        "schema_validation_error_sample": validation_errors[:50],
        "duplicate_observation_id_count": len(duplicate_ids),
        "duplicate_observation_id_sample": duplicate_ids[:50],
        "leakage_error_count": len(leakage_errors),
        "leakage_error_sample": leakage_errors[:50],
        "candidate_delivered_mismatch_count": len(candidate_mismatches),
        "candidate_delivered_mismatch_sample": candidate_mismatches[:50],
        "target_error_count": len(target_errors),
        "target_error_sample": target_errors[:50],
        "supervised_usable_count": readiness_counter.get("supervised_usable", 0),
        "supervised_unusable_count": len(records) - readiness_counter.get("supervised_usable", 0),
        "signed_gain_range_ok": signed_range_ok,
        "signed_gain_min": min(signed_gains) if signed_gains else None,
        "signed_gain_avg": mean(signed_gains) if signed_gains else None,
        "signed_gain_max": max(signed_gains) if signed_gains else None,
        "sequential_consistency": sequential,
    }


def model_specs(sklearn_available: bool) -> list[tuple[str, str | None]]:
    specs: list[tuple[str, str | None]] = [
        ("dummy_candidate_scorer_v1", "mean"),
        ("dummy_candidate_scorer_v1", "majority"),
        ("linear_candidate_scorer_v1", None),
    ]
    if sklearn_available:
        specs.extend(("tree_candidate_scorer_v1", variant) for variant in TREE_MODEL_VARIANTS)
        specs.extend(
            ("sklearn_candidate_scorer_v1", variant)
            for variant in (
                "hist_gradient_boosting",
                "ada_boost",
                "bagging",
                "ridge",
                "elastic_net",
                "k_neighbors",
                "linear_support_vector",
                "shallow_mlp",
            )
        )
    return specs


def pick_recommended_model(primary_rows: list[dict[str, Any]], best_offline: Mapping[str, Any], linear_row: Mapping[str, Any]) -> dict[str, Any]:
    linear_rmse = _safe_float(linear_row.get("combined_outcome_score_rmse"))
    best_rmse = _safe_float(best_offline.get("combined_outcome_score_rmse"))
    delta = linear_rmse - best_rmse
    relative_delta = delta / linear_rmse if linear_rmse and math.isfinite(linear_rmse) else 0.0
    if model_label(best_offline) == model_label(linear_row) or relative_delta < 0.03:
        return {
            "recommended_model": dict(linear_row),
            "path": "keep_current_linear",
            "rewrite_runtime": False,
            "reason": "Best offline gain over linear is below the practical rewrite threshold.",
            "linear_vs_recommended_delta_combined_rmse": 0.0,
            "linear_vs_recommended_delta_relative": 0.0,
        }

    if best_offline.get("model_family") == "tree_candidate_scorer_v1":
        return {
            "recommended_model": dict(best_offline),
            "path": "implement_typescript_tree_runtime",
            "rewrite_runtime": True,
            "reason": "Best offline model is a JSON-exported tree ensemble and is materially better than linear.",
            "linear_vs_recommended_delta_combined_rmse": round(delta, 6),
            "linear_vs_recommended_delta_relative": round(relative_delta, 6),
        }

    tree_rows = [row for row in primary_rows if row["model_family"] == "tree_candidate_scorer_v1"]
    best_tree = min(tree_rows, key=selection_key) if tree_rows else None
    if best_tree is not None:
        tree_delta = linear_rmse - _safe_float(best_tree.get("combined_outcome_score_rmse"))
        tree_relative_delta = tree_delta / linear_rmse if linear_rmse and math.isfinite(linear_rmse) else 0.0
        if tree_relative_delta >= 0.05:
            return {
                "recommended_model": dict(best_tree),
                "path": "implement_typescript_tree_runtime",
                "rewrite_runtime": True,
                "reason": (
                    "Best offline model is not currently executable/exported for EduAI runtime; "
                    "the best existing tree artifact is materially better than linear and has the clearest integration path."
                ),
                "linear_vs_recommended_delta_combined_rmse": round(tree_delta, 6),
                "linear_vs_recommended_delta_relative": round(tree_relative_delta, 6),
            }

    return {
        "recommended_model": dict(linear_row),
        "path": "keep_current_linear_until_export_runtime_exists",
        "rewrite_runtime": False,
        "reason": "Non-linear winner is not currently deployable enough; keep linear until an executable export/runtime contract is added.",
        "linear_vs_recommended_delta_combined_rmse": 0.0,
        "linear_vs_recommended_delta_relative": 0.0,
    }


def build_selected_eval(
    records: list[dict[str, Any]],
    scorer: Any,
    selected_row: Mapping[str, Any],
    comparison_report: Mapping[str, Any],
    *,
    seed: int,
    train_ratio: float,
    validation_ratio: float,
) -> dict[str, Any]:
    detailed_eval = evaluate_candidate_scorer(
        records,
        scorer,
        seed=seed,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        split_strategy=str(selected_row["split_strategy"]),
        target_schema_version=TARGET_SCHEMA_V2,
        include_policy_diagnostics=True,
    )
    selected_eval = deepcopy(detailed_eval)
    selected_eval["selected_model"] = dict(selected_row)
    selected_eval["model_comparison_summary"] = {
        "schema_version": comparison_report["schema_version"],
        "selection_criterion": comparison_report["selection_criterion"],
        "best_offline_model": comparison_report["best_offline_model"],
        "best_currently_runtime_compatible_model": comparison_report["best_currently_runtime_compatible_model"],
        "recommended_integration": comparison_report["recommended_integration"],
    }
    return selected_eval


def write_best_offline_outputs(
    records: list[dict[str, Any]],
    scorer: Any,
    selected_row: Mapping[str, Any],
    selected_eval: Mapping[str, Any],
    comparison_report: Mapping[str, Any],
    artifact_path: Path,
    eval_path: Path,
    *,
    seed: int,
) -> dict[str, Any]:
    if selected_row.get("export_status", {}).get("current_model_artifact_exportable") is True:
        artifact = build_model_artifact(
            scorer=scorer,
            model_version=(
                f"{selected_row['model_family']}"
                f"{'_' + str(selected_row['model_variant']) if selected_row.get('model_variant') else ''}"
                f"_{selected_row['split_strategy']}_extended_seed_{seed}"
            ),
            training_data_summary=summarize_observations(records),
            evaluation_report=selected_eval,
            seed=seed,
            split_strategy=str(selected_row["split_strategy"]),
            model_family=str(selected_row["model_family"]),
            target_schema_version=TARGET_SCHEMA_V2,
            runtime_compatible=selected_row.get("model_family") == "linear_candidate_scorer_v1",
            limitations=[
                "Artifact is trained on synthetic SUN observations; this is not proof on real learners.",
                "Observed rows do not contain full counterfactual labels for every possible candidate_config.",
                "Only linear_candidate_scorer_v1 is executable by the current TypeScript runtime.",
            ],
        )
        artifact["evaluation"]["model_comparison"] = {
            "schema_version": comparison_report["schema_version"],
            "best_offline_model": comparison_report["best_offline_model"],
            "best_currently_runtime_compatible_model": comparison_report["best_currently_runtime_compatible_model"],
            "recommended_integration": comparison_report["recommended_integration"],
        }
        artifact["compatibility"]["runtime_compatible"] = selected_row.get("model_family") == "linear_candidate_scorer_v1"
        write_model_artifact(artifact_path, artifact)
        write_json(eval_path, selected_eval)
        return {
            "exported_model_artifact": True,
            "artifact_path": str(artifact_path),
            "eval_path": str(eval_path),
            "reason": "best model has an existing EduAI JSON scorer payload",
        }

    payload = scorer.to_payload() if hasattr(scorer, "to_payload") else {}
    summary = {
        "schema_version": "sun_best_extended_offline_model_summary.v1",
        "created_at": utc_now_iso(),
        "exported_model_artifact": False,
        "selected_model": dict(selected_row),
        "metrics": selected_eval.get("model_metrics", {}),
        "parameters": dict(getattr(scorer, "parameters", {})),
        "payload_summary": payload,
        "reason": selected_row.get("export_status", {}).get("reason"),
        "runtime_export_needed": (
            "Define executable payload schema, add Python artifact_loader support if needed, "
            "then implement and test TypeScript scorer before production use."
        ),
    }
    write_json(artifact_path, summary)
    write_json(eval_path, selected_eval)
    return {
        "exported_model_artifact": False,
        "artifact_path": str(artifact_path),
        "eval_path": str(eval_path),
        "reason": summary["reason"],
    }


def format_float(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6f}".rstrip("0").rstrip(".")
    return str(value)


def markdown_table(rows: list[Mapping[str, Any]]) -> list[str]:
    lines = [
        "| model | train | val | test | signed RMSE | combined RMSE | log loss | bal acc | majority acc | gap | sec |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(row["model_label"]),
                    str(row["train_rows"]),
                    str(row["validation_rows"]),
                    str(row["test_rows"]),
                    format_float(row["signed_gain_rmse"]),
                    format_float(row["combined_outcome_score_rmse"]),
                    format_float(row["next_step_success_log_loss"]),
                    format_float(row["next_step_success_balanced_accuracy"]),
                    format_float(row["majority_class_accuracy"]),
                    format_float(row["combined_rmse_generalization_gap"]),
                    format_float(row["training_time_seconds"]),
                ]
            )
            + " |"
        )
    return lines


def build_extended_markdown(report: Mapping[str, Any]) -> str:
    rows = list(report["comparison_table"])
    primary_rows = [row for row in rows if row["split_strategy"] == PRIMARY_SPLIT]
    observation_rows = [row for row in rows if row["split_strategy"] == "observation_id_hash"]
    time_rows = [row for row in rows if row["split_strategy"] == "time_ordered"]
    lines = [
        "# SUN extended model comparison",
        "",
        f"- Dataset: `{report['input']}`",
        f"- Seed: {report['seed']}",
        f"- Target schema: `{report['target_schema_version']}`",
        f"- Best offline: `{report['best_offline_model']['model_label']}`",
        f"- Best currently runtime-compatible: `{report['best_currently_runtime_compatible_model']['model_label']}`",
        f"- Recommended integration: `{report['recommended_integration']['recommended_model']['model_label']}`",
        f"- Runtime rewrite needed: `{report['recommended_integration']['rewrite_runtime']}`",
        "",
        "## User split",
        "",
    ]
    lines.extend(markdown_table(primary_rows))
    lines.extend(["", "## Observation split", ""])
    lines.extend(markdown_table(observation_rows[:8]))
    lines.extend(["", "## Time ordered split", ""])
    lines.extend(markdown_table(time_rows[:8]))
    lines.extend(["", "## Failures", ""])
    if report["failures"]:
        for failure in report["failures"]:
            lines.append(
                f"- `{failure['model_label']}` / `{failure['split_strategy']}`: {failure['error']}"
            )
    else:
        lines.append("- Нет.")
    lines.extend(
        [
            "",
            "## Honest limitations",
            "",
            "- Synthetic data only; no real learner effectiveness proof.",
            "- No full counterfactual labels for every possible candidate.",
            "- Current TypeScript runtime supports only linear_candidate_scorer_v1.",
            "- Non-linear offline winners require explicit runtime/export work before production use.",
            "",
        ]
    )
    return "\n".join(lines)


def build_final_report(report: Mapping[str, Any], output_paths: Mapping[str, str], commands: list[str]) -> str:
    primary_rows = [row for row in report["comparison_table"] if row["split_strategy"] == PRIMARY_SPLIT]
    observation_rows = [row for row in report["comparison_table"] if row["split_strategy"] == "observation_id_hash"]
    time_rows = [row for row in report["comparison_table"] if row["split_strategy"] == "time_ordered"]
    validation = report["validation"]
    lines = [
        "# SUN extended model comparison report",
        "",
        "## Проверка перед стартом",
        "",
        f"- Merged dataset exists: `{report['preflight']['merged_dataset_exists']}`.",
        f"- Current models dir exists: `{report['preflight']['current_models_dir_exists']}`.",
        f"- Current reports dir exists: `{report['preflight']['current_reports_dir_exists']}`.",
        f"- Runtime TS model families: `{', '.join(report['runtime_support']['supported_model_families'])}`.",
        f"- Target schema: `{report['target_schema_version']}`.",
        "- Доступные библиотеки в `ml/.venv`: "
        + ", ".join(
            f"{name} {details.get('version', 'unknown')}"
            for name, details in report["dependencies"].items()
            if details.get("available")
        )
        + ".",
        "- Недоступные библиотеки: "
        + ", ".join(
            name
            for name, details in report["dependencies"].items()
            if not details.get("available")
        )
        + ".",
        "- Риски: synthetic data only; no real learner effectiveness proof; no full counterfactual labels; runtime needs rewrite for non-linear winner.",
        "",
        "## Текущие артефакты",
        "",
    ]
    for name, data in report["current_artifacts"].items():
        lines.append(f"- {name}: `{data['path']}` exists={data['exists']}")
    lines.extend(
        [
            "",
            "## Валидация датасета",
            "",
            f"- Status: `{validation['status']}`.",
            f"- Rows: {validation['row_count']}.",
            f"- Duplicate observation_id: {validation['duplicate_observation_id_count']}.",
            f"- Leakage errors: {validation['leakage_error_count']}.",
            f"- Candidate/delivered mismatch: {validation['candidate_delivered_mismatch_count']}.",
            f"- Supervised usable: {validation['supervised_usable_count']}.",
            f"- Signed gain range ok: `{validation['signed_gain_range_ok']}` ({validation['signed_gain_min']}..{validation['signed_gain_max']}).",
            f"- Sequential consistency: `{validation['sequential_consistency']['status']}`.",
            "",
            "## Модели",
            "",
        ]
    )
    lines.extend(f"- `{spec['model_label']}`" for spec in report["model_specs"])
    lines.extend(["", "## Failures", ""])
    if report["failures"]:
        lines.extend(
            f"- `{failure['model_label']}` / `{failure['split_strategy']}`: {failure['error']}"
            for failure in report["failures"]
        )
    else:
        lines.append("- Нет.")
    lines.extend(["", "## User split comparison", ""])
    lines.extend(markdown_table(primary_rows))
    lines.extend(["", "## Observation/time split summary", "", "Observation_id_hash top rows:"])
    lines.extend(markdown_table(observation_rows[:6]))
    lines.extend(["", "Time_ordered top rows:"])
    lines.extend(markdown_table(time_rows[:6]))
    best = report["best_offline_model"]
    runtime = report["best_currently_runtime_compatible_model"]
    recommendation = report["recommended_integration"]
    lines.extend(
        [
            "",
            "## Выбор",
            "",
            f"- Best offline model: `{best['model_label']}`; combined RMSE={best['combined_outcome_score_rmse']}; signed RMSE={best['signed_gain_rmse']}; log loss={best['next_step_success_log_loss']}.",
            f"- Best currently runtime-compatible model: `{runtime['model_label']}`; combined RMSE={runtime['combined_outcome_score_rmse']}.",
            f"- Recommended model to integrate: `{recommendation['recommended_model']['model_label']}`.",
            f"- Переписывать runtime: `{recommendation['rewrite_runtime']}`.",
            f"- Linear vs recommended delta: {recommendation['linear_vs_recommended_delta_combined_rmse']} combined RMSE ({recommendation['linear_vs_recommended_delta_relative']} relative).",
            f"- Reason: {recommendation['reason']}",
            "",
            "## Созданные файлы",
            "",
        ]
    )
    lines.extend(f"- {name}: `{path}`" for name, path in output_paths.items())
    lines.extend(["", "## Команды", ""])
    lines.extend(f"- `{command}`" for command in commands)
    lines.extend(
        [
            "",
            "## Честные ограничения",
            "",
            "- Используется только synthetic SUN dataset; это не доказательство эффективности на реальных учениках.",
            "- Нет полных counterfactual labels для всех возможных candidate_config.",
            "- Features берутся из pre_decision_features + candidate_config + разрешённых metadata; outcome не используется как feature.",
            "- Current TypeScript runtime исполняет только linear_candidate_scorer_v1; tree/sklearn winners не runtime-ready без реализации и тестов.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    input_path = (REPO_ROOT / args.input).resolve()
    extended_artifacts_dir = (REPO_ROOT / args.extended_artifacts_dir).resolve()
    extended_reports_dir = (REPO_ROOT / args.extended_reports_dir).resolve()
    current_models_dir = (REPO_ROOT / args.current_models_dir).resolve()
    current_reports_dir = (REPO_ROOT / args.current_reports_dir).resolve()
    extended_artifacts_dir.mkdir(parents=True, exist_ok=True)
    extended_reports_dir.mkdir(parents=True, exist_ok=True)

    preflight = {
        "merged_dataset_exists": input_path.exists() and input_path.is_file(),
        "merged_dataset_path": str(input_path),
        "current_models_dir_exists": current_models_dir.exists() and current_models_dir.is_dir(),
        "current_reports_dir_exists": current_reports_dir.exists() and current_reports_dir.is_dir(),
    }
    if not preflight["merged_dataset_exists"]:
        raise FileNotFoundError(f"Merged dataset not found: {input_path}")
    if not preflight["current_models_dir_exists"]:
        raise FileNotFoundError(f"Current models dir not found: {current_models_dir}")
    if not preflight["current_reports_dir_exists"]:
        raise FileNotFoundError(f"Current reports dir not found: {current_reports_dir}")

    current_paths = current_artifact_paths(current_models_dir, current_reports_dir, input_path)
    runtime_support = detect_runtime_support()
    dependencies = dependency_versions()
    sklearn_available = bool(dependencies.get("sklearn", {}).get("available"))

    records, strict_errors, empty_line_count = read_jsonl_strict(input_path)
    validation = validate_dataset_contract(records, strict_errors, empty_line_count)
    if validation["status"] != "passed":
        failure_report = {
            "schema_version": "sun_extended_model_comparison.v1",
            "created_at": utc_now_iso(),
            "input": str(input_path),
            "preflight": preflight,
            "current_artifacts": current_paths,
            "runtime_support": runtime_support,
            "dependencies": dependencies,
            "validation": validation,
            "status": "failed_validation",
        }
        write_json(extended_reports_dir / "sun_extended_model_comparison_seed42.json", failure_report)
        raise RuntimeError("Dataset validation failed; extended comparison was not run.")

    split_strategies = [PRIMARY_SPLIT, "observation_id_hash", "time_ordered"]
    specs = model_specs(sklearn_available)
    comparison_rows: list[dict[str, Any]] = []
    result_by_key: dict[tuple[str, str | None, str], Any] = {}
    failures: list[dict[str, Any]] = []

    for split_strategy in split_strategies:
        for model_family, model_variant in specs:
            label = model_label({"model_family": model_family, "model_variant": model_variant})
            print(f"RUN {split_strategy} {label}", flush=True)
            timeout_seconds = timeout_for_model(args.model_timeout_seconds, model_family, model_variant)
            try:
                scorer, evaluation_report, skipped_rows, elapsed, training_warnings = train_one_spec_with_timeout(
                    records,
                    timeout_seconds=timeout_seconds,
                    model_family=model_family,
                    model_variant=model_variant,
                    split_strategy=split_strategy,
                    seed=args.seed,
                    train_ratio=args.train_ratio,
                    validation_ratio=args.validation_ratio,
                    test_ratio=args.test_ratio,
                )
            except Exception as error:
                print(f"FAIL {split_strategy} {label}: {error}", flush=True)
                failures.append(
                    {
                        "model_family": model_family,
                        "model_variant": model_variant,
                        "model_label": label,
                        "split_strategy": split_strategy,
                        "error": str(error),
                    }
                )
                continue
            key = (model_family, model_variant, split_strategy)
            result_by_key[key] = scorer
            comparison_rows.append(
                test_metric_row(
                    model_family=model_family,
                    model_variant=model_variant,
                    split_strategy=split_strategy,
                    evaluation_report=evaluation_report,
                    skipped_rows=skipped_rows,
                    training_time_seconds=elapsed,
                    training_warnings=training_warnings,
                    runtime_integration_rank=runtime_integration_rank(model_family, model_variant),
                    export_status=export_status_for(model_family, model_variant),
                )
            )
            print(f"DONE {split_strategy} {label} {elapsed:.3f}s", flush=True)

    primary_rows = [row for row in comparison_rows if row["split_strategy"] == PRIMARY_SPLIT]
    if not primary_rows:
        raise RuntimeError("No user_id_hash comparison rows were produced")
    best_offline = min(primary_rows, key=selection_key)
    runtime_rows = [row for row in primary_rows if row["model_family"] in SUPPORTED_TS_MODEL_FAMILIES]
    if not runtime_rows:
        raise RuntimeError("No currently runtime-compatible row was produced")
    best_runtime = min(runtime_rows, key=selection_key)
    recommendation = pick_recommended_model(primary_rows, best_offline, best_runtime)
    sorted_rows = sorted(
        comparison_rows,
        key=lambda row: (
            row["split_strategy"] != PRIMARY_SPLIT,
            row["split_strategy"],
            selection_key(row),
            row["model_label"],
        ),
    )

    comparison_report: dict[str, Any] = {
        "schema_version": "sun_extended_model_comparison.v1",
        "created_at": utc_now_iso(),
        "input": str(input_path),
        "seed": args.seed,
        "target_schema_version": TARGET_SCHEMA_V2,
        "training_data_summary": summarize_observations(records),
        "preflight": preflight,
        "current_artifacts": current_paths,
        "runtime_support": runtime_support,
        "dependencies": dependencies,
        "validation": validation,
        "split_strategies": split_strategies,
        "model_specs": [
            {
                "model_family": family,
                "model_variant": variant,
                "model_label": model_label({"model_family": family, "model_variant": variant}),
                "export_status": export_status_for(family, variant),
            }
            for family, variant in specs
        ],
        "comparison_table": sorted_rows,
        "best_offline_model": best_offline,
        "best_currently_runtime_compatible_model": best_runtime,
        "recommended_integration": recommendation,
        "selection_criterion": [
            "primary split=user_id_hash",
            "lower test combined_outcome_score_rmse",
            "then lower signed_gain_rmse",
            "then lower next_step_success_log_loss",
            "then lower absolute combined RMSE generalization gap",
            "then lower runtime integration complexity",
        ],
        "failures": failures,
        "honesty_notes": [
            "Synthetic data only; no proof of real learner effectiveness.",
            "Observed rows do not provide full counterfactual labels for every possible candidate.",
            "Outcome values are targets only and are not used as features.",
            "Current TypeScript runtime supports only linear_candidate_scorer_v1.",
        ],
    }

    comparison_json_path = extended_reports_dir / "sun_extended_model_comparison_seed42.json"
    comparison_md_path = extended_reports_dir / "sun_extended_model_comparison_seed42.md"
    write_json(comparison_json_path, comparison_report)
    comparison_md_path.write_text(build_extended_markdown(comparison_report), encoding="utf-8")

    best_key = (
        str(best_offline["model_family"]),
        best_offline.get("model_variant"),
        str(best_offline["split_strategy"]),
    )
    best_scorer = result_by_key[best_key]
    selected_eval = build_selected_eval(
        records,
        best_scorer,
        best_offline,
        comparison_report,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
    )
    best_artifact_path = extended_artifacts_dir / "sun_best_extended_offline_model_seed42.json"
    best_eval_path = extended_artifacts_dir / "sun_best_extended_offline_model_seed42_eval.json"
    export_result = write_best_offline_outputs(
        records,
        best_scorer,
        best_offline,
        selected_eval,
        comparison_report,
        best_artifact_path,
        best_eval_path,
        seed=args.seed,
    )
    comparison_report["best_offline_export"] = export_result
    write_json(comparison_json_path, comparison_report)
    comparison_md_path.write_text(build_extended_markdown(comparison_report), encoding="utf-8")

    output_paths = {
        "extended_model_comparison_json": str(comparison_json_path),
        "extended_model_comparison_markdown": str(comparison_md_path),
        "best_extended_offline_model": str(best_artifact_path),
        "best_extended_offline_eval": str(best_eval_path),
        "final_report": str(extended_reports_dir / "codex_report_sun_extended_model_comparison.md"),
    }
    command = (
        "ml/.venv/bin/python ml/scripts/train_and_compare_sun_extended_models.py "
        "--input ml/src/eduai_ml/training/SUN/merged/sun_training_observations_merged_v1.jsonl "
        "--extended-artifacts-dir ml/src/eduai_ml/training/SUN/artifacts/extended_models "
        "--extended-reports-dir ml/src/eduai_ml/training/SUN/artifacts/extended_reports "
        "--current-models-dir ml/src/eduai_ml/training/SUN/artifacts/models "
        "--current-reports-dir ml/src/eduai_ml/training/SUN/artifacts/reports "
        f"--seed {args.seed} "
        f"--model-timeout-seconds {args.model_timeout_seconds}"
    )
    final_report_path = extended_reports_dir / "codex_report_sun_extended_model_comparison.md"
    final_report_path.write_text(
        build_final_report(comparison_report, output_paths, [command]),
        encoding="utf-8",
    )

    print(
        "OK "
        + json.dumps(
            {
                "rows": len(records),
                "comparison_rows": len(comparison_rows),
                "failures": len(failures),
                "best_offline_model": best_offline["model_label"],
                "best_runtime_model": best_runtime["model_label"],
                "recommended_model": recommendation["recommended_model"]["model_label"],
                "recommended_rewrite_runtime": recommendation["rewrite_runtime"],
                "report": str(final_report_path),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
