#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Mapping, Sequence

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    OUTCOME_FIELD_NAMES,
    load_jsonl_dataset,
    validate_observation_record,
)
from eduai_ml.data.splits import split_overlap_diagnostics, split_records_by_strategy  # noqa: E402
from eduai_ml.training.feature_extraction import (  # noqa: E402
    FEATURE_SCHEMA_VERSION,
    extract_features,
    get_feature_names,
)
from eduai_ml.training.target_builder import (  # noqa: E402
    TARGET_SCHEMA_V2,
    TargetUnavailableError,
    build_targets,
)

MODEL_FAMILY = "catboost_candidate_scorer_v1"
ARTIFACT_SCHEMA_VERSION = "catboost_candidate_scorer_payload.v1"
THESIS_POLICY_ID = "policy_v2"
SPLIT_STRATEGY = "user_id_hash"
TARGET_NAMES = (
    "expected_learning_gain_signed",
    "expected_learning_gain_proxy",
    "expected_next_step_success",
    "combined_outcome_score",
)
PRIMARY_LEARNING_GAIN_TARGET = "expected_learning_gain_signed"
EXCLUDED_FEATURE_NAMES = {
    "subject_hash_scaled",
    "topic_hash_scaled",
    "source_kind__synthetic",
    "source_kind__open_dataset",
    "source_kind__real_user",
}


@dataclass(frozen=True)
class PreparedRow:
    observation_id: str
    split: str
    record: Mapping[str, Any]
    features: dict[str, float]
    targets: dict[str, float]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the thesis policy_v2 CatBoost candidate scorer.")
    parser.add_argument(
        "--input",
        default="1805/ml_training_v10_results/exports/real_user_training_observations_v10.strict.jsonl",
    )
    parser.add_argument(
        "--out-dir",
        default="ml/src/eduai_ml/training/THESIS_V2/artifacts/catboost_candidate_scorer_v1",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--iterations", type=int, default=300)
    parser.add_argument("--learning-rate", type=float, default=0.05)
    parser.add_argument("--depth", type=int, default=6)
    parser.add_argument("--parity-sample-size", type=int, default=100)
    parser.add_argument("--thread-count", type=int, default=1)
    return parser.parse_args()


def require_catboost() -> tuple[Any, str]:
    try:
        import catboost
        from catboost import CatBoostRegressor
    except ImportError as error:
        raise RuntimeError(
            'Missing optional dependency "catboost". Install it with: '
            'ml/.venv/bin/python -m pip install -e "ml[train]"'
        ) from error
    return CatBoostRegressor, str(getattr(catboost, "__version__", "unknown"))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(payload), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def catboost_feature_names() -> list[str]:
    return [name for name in get_feature_names() if name not in EXCLUDED_FEATURE_NAMES]


def extract_catboost_features(record: Mapping[str, Any], feature_names: Sequence[str]) -> dict[str, float]:
    pre_decision_features = record.get("pre_decision_features")
    if not isinstance(pre_decision_features, Mapping):
        raise ValueError("pre_decision_features must be an object")
    leaked_fields = sorted(set(pre_decision_features.keys()) & OUTCOME_FIELD_NAMES)
    if leaked_fields:
        raise ValueError(f"pre_decision_features contains outcome fields: {leaked_fields}")
    raw_features = extract_features(record)
    return {name: float(raw_features.get(name, 0.0)) for name in feature_names}


def prepare_rows(
    records: list[Mapping[str, Any]],
    *,
    feature_names: Sequence[str],
    seed: int,
    train_ratio: float,
    validation_ratio: float,
) -> tuple[list[PreparedRow], int, dict[str, Any]]:
    supervised_records: list[Mapping[str, Any]] = []
    skipped_rows = 0
    targets_by_observation_id: dict[str, dict[str, float]] = {}
    features_by_observation_id: dict[str, dict[str, float]] = {}

    for record in records:
        validate_observation_record(record)
        observation_id = str(record.get("ids", {}).get("observation_id") or "")
        if not observation_id:
            skipped_rows += 1
            continue
        try:
            targets = build_targets(record, target_schema_version=TARGET_SCHEMA_V2)
        except TargetUnavailableError:
            skipped_rows += 1
            continue
        features = extract_catboost_features(record, feature_names)
        supervised_records.append(record)
        targets_by_observation_id[observation_id] = {name: float(targets[name]) for name in TARGET_NAMES}
        features_by_observation_id[observation_id] = features

    split_records = split_records_by_strategy(
        supervised_records,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        seed=seed,
        split_strategy=SPLIT_STRATEGY,
    )
    split_diagnostics = split_overlap_diagnostics(split_records, split_strategy=SPLIT_STRATEGY)
    user_overlap_counts = split_diagnostics.get("users_overlap_counts", {})
    if any(int(value) > 0 for value in dict(user_overlap_counts).values()):
        raise RuntimeError(f"user leakage detected across splits: {user_overlap_counts}")
    empty_splits = split_diagnostics.get("empty_split_warnings", [])
    if empty_splits:
        raise RuntimeError(f"empty split after user-level split: {empty_splits}")

    rows: list[PreparedRow] = []
    for split_name, split_rows in split_records.items():
        for record in split_rows:
            observation_id = str(record.get("ids", {}).get("observation_id") or "")
            rows.append(
                PreparedRow(
                    observation_id=observation_id,
                    split=split_name,
                    record=record,
                    features=features_by_observation_id[observation_id],
                    targets=targets_by_observation_id[observation_id],
                )
            )
    return rows, skipped_rows, split_diagnostics


def matrix_for_rows(rows: Sequence[PreparedRow], feature_names: Sequence[str]) -> list[list[float]]:
    return [[float(row.features[name]) for name in feature_names] for row in rows]


def targets_for_rows(rows: Sequence[PreparedRow]) -> list[list[float]]:
    return [[float(row.targets[name]) for name in TARGET_NAMES] for row in rows]


def prediction_rows(raw_predictions: Any) -> list[list[float]]:
    values = raw_predictions.tolist() if hasattr(raw_predictions, "tolist") else raw_predictions
    if not isinstance(values, list):
        raise ValueError("CatBoost prediction output is not a list")
    if not values:
        return []
    first = values[0]
    if isinstance(first, (int, float)):
        return [[float(value)] for value in values]
    return [[float(value) for value in row] for row in values]


def clamp_prediction(target_name: str, value: float) -> float:
    if target_name == "expected_learning_gain_signed":
        return max(-1.0, min(1.0, value))
    return max(0.0, min(1.0, value))


def predictions_by_target(raw_predictions: Any) -> list[dict[str, float]]:
    rows = prediction_rows(raw_predictions)
    result: list[dict[str, float]] = []
    for row in rows:
        if len(row) != len(TARGET_NAMES):
            raise ValueError(f"Expected {len(TARGET_NAMES)} targets, got {len(row)}")
        result.append(
            {
                target_name: round(clamp_prediction(target_name, row[index]), 10)
                for index, target_name in enumerate(TARGET_NAMES)
            }
        )
    return result


def rmse(errors: Sequence[float]) -> float | None:
    if not errors:
        return None
    return round(math.sqrt(mean([error * error for error in errors])), 6)


def mae(errors: Sequence[float]) -> float | None:
    if not errors:
        return None
    return round(mean([abs(error) for error in errors]), 6)


def balanced_accuracy(y_true: Sequence[float], y_pred: Sequence[int]) -> float | None:
    positives = [pred for truth, pred in zip(y_true, y_pred, strict=True) if truth == 1.0]
    negatives = [pred for truth, pred in zip(y_true, y_pred, strict=True) if truth == 0.0]
    if not positives or not negatives:
        return None
    true_positive_rate = sum(1 for pred in positives if pred == 1) / len(positives)
    true_negative_rate = sum(1 for pred in negatives if pred == 0) / len(negatives)
    return round((true_positive_rate + true_negative_rate) / 2, 6)


def split_metrics(rows: Sequence[PreparedRow], predictions: Sequence[Mapping[str, float]]) -> dict[str, Any]:
    metrics: dict[str, Any] = {"row_count": len(rows)}
    for target_name in TARGET_NAMES:
        errors = [float(prediction[target_name]) - float(row.targets[target_name]) for row, prediction in zip(rows, predictions, strict=True)]
        metrics[target_name] = {
            "mae": mae(errors),
            "rmse": rmse(errors),
        }

    success_truth = [float(row.targets["expected_next_step_success"]) for row in rows]
    success_probabilities = [float(prediction["expected_next_step_success"]) for prediction in predictions]
    success_predictions = [1 if probability >= 0.5 else 0 for probability in success_probabilities]
    accuracy = None
    if success_truth:
        accuracy = round(
            sum(
                1
                for truth, prediction in zip(success_truth, success_predictions, strict=True)
                if int(truth) == prediction
            )
            / len(success_truth),
            6,
        )
    positive_count = sum(1 for value in success_truth if value == 1.0)
    negative_count = sum(1 for value in success_truth if value == 0.0)
    majority_class_accuracy = None
    positive_rate = None
    if success_truth:
        majority_class_accuracy = round(max(positive_count, negative_count) / len(success_truth), 6)
        positive_rate = round(positive_count / len(success_truth), 6)
    metrics["expected_next_step_success"].update(
        {
            "accuracy": accuracy,
            "balanced_accuracy": balanced_accuracy(success_truth, success_predictions),
            "majority_class_accuracy": majority_class_accuracy,
            "positive_rate": positive_rate,
        }
    )
    metrics["learning_gain_target"] = PRIMARY_LEARNING_GAIN_TARGET
    metrics["learning_gain_mae"] = metrics[PRIMARY_LEARNING_GAIN_TARGET]["mae"]
    metrics["learning_gain_rmse"] = metrics[PRIMARY_LEARNING_GAIN_TARGET]["rmse"]
    return metrics


def write_jsonl(path: Path, rows: Sequence[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(dict(row), ensure_ascii=False, sort_keys=True) + "\n")


def build_parity_rows(
    rows: Sequence[PreparedRow],
    predictions: Sequence[Mapping[str, float]],
    *,
    sample_size: int,
) -> list[dict[str, Any]]:
    bounded_size = max(50, min(200, sample_size))
    result: list[dict[str, Any]] = []
    for row, prediction in list(zip(rows, predictions, strict=True))[:bounded_size]:
        result.append(
            {
                "observation_id": row.observation_id,
                "features": row.features,
                "python_prediction": dict(prediction),
                "target": row.targets,
            }
        )
    return result


def rows_by_split(rows: Sequence[PreparedRow], split_name: str) -> list[PreparedRow]:
    return [row for row in rows if row.split == split_name]


def main() -> int:
    args = parse_args()
    if abs((args.train_ratio + args.validation_ratio + args.test_ratio) - 1.0) > 1e-9:
        raise ValueError("train_ratio + validation_ratio + test_ratio must equal 1")

    CatBoostRegressor, catboost_version = require_catboost()
    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input dataset does not exist: {input_path}")

    feature_names = catboost_feature_names()
    records = load_jsonl_dataset(input_path)
    prepared_rows, skipped_rows, split_diagnostics = prepare_rows(
        records,
        feature_names=feature_names,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
    )
    train_rows = rows_by_split(prepared_rows, "train")
    validation_rows = rows_by_split(prepared_rows, "validation")
    test_rows = rows_by_split(prepared_rows, "test")

    print("feature_columns=" + json.dumps(feature_names, ensure_ascii=False))
    print(
        "split_rows="
        + json.dumps(
            {
                "train": len(train_rows),
                "validation": len(validation_rows),
                "test": len(test_rows),
                "skipped": skipped_rows,
            },
            sort_keys=True,
        )
    )

    model = CatBoostRegressor(
        loss_function="MultiRMSE",
        eval_metric="MultiRMSE",
        iterations=args.iterations,
        learning_rate=args.learning_rate,
        depth=args.depth,
        random_seed=args.seed,
        allow_writing_files=False,
        thread_count=args.thread_count,
        od_type="Iter",
        od_wait=40,
        use_best_model=True,
        verbose=False,
    )
    model.fit(
        matrix_for_rows(train_rows, feature_names),
        targets_for_rows(train_rows),
        eval_set=(matrix_for_rows(validation_rows, feature_names), targets_for_rows(validation_rows)),
        verbose=False,
    )

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / "model.cbm"
    artifact_path = out_dir / "artifact.json"
    metrics_path = out_dir / "metrics.json"
    feature_schema_path = out_dir / "feature_schema.json"
    parity_sample_path = out_dir / "prediction_parity_sample.jsonl"

    model.save_model(str(model_path), format="cbm")

    train_predictions = predictions_by_target(model.predict(matrix_for_rows(train_rows, feature_names)))
    validation_predictions = predictions_by_target(model.predict(matrix_for_rows(validation_rows, feature_names)))
    test_predictions = predictions_by_target(model.predict(matrix_for_rows(test_rows, feature_names)))
    metrics_by_split = {
        "train": split_metrics(train_rows, train_predictions),
        "validation": split_metrics(validation_rows, validation_predictions),
        "test": split_metrics(test_rows, test_predictions),
    }
    test_metrics = metrics_by_split["test"]

    metrics_payload: dict[str, Any] = {
        "model_family": MODEL_FAMILY,
        "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
        "catboost_version": catboost_version,
        "source_dataset": str(input_path),
        "input_rows": len(records),
        "supervised_usable_rows": len(prepared_rows),
        "train_rows": len(train_rows),
        "validation_rows": len(validation_rows),
        "test_rows": len(test_rows),
        "skipped_rows": skipped_rows,
        "target_name": PRIMARY_LEARNING_GAIN_TARGET,
        "target_names": list(TARGET_NAMES),
        "learning_gain_target": PRIMARY_LEARNING_GAIN_TARGET,
        "learning_gain_rmse": test_metrics["learning_gain_rmse"],
        "learning_gain_mae": test_metrics["learning_gain_mae"],
        "next_step_success_accuracy": test_metrics["expected_next_step_success"]["accuracy"],
        "next_step_success_balanced_accuracy": test_metrics["expected_next_step_success"]["balanced_accuracy"],
        "split_strategy": SPLIT_STRATEGY,
        "split_ratios": {
            "train": args.train_ratio,
            "validation": args.validation_ratio,
            "test": args.test_ratio,
        },
        "feature_count": len(feature_names),
        "categorical_feature_count": 0,
        "categorical_feature_columns": [],
        "metrics_by_split": metrics_by_split,
        "split_diagnostics": split_diagnostics,
        "training_parameters": {
            "iterations": args.iterations,
            "best_iteration": int(model.get_best_iteration() or 0),
            "learning_rate": args.learning_rate,
            "depth": args.depth,
            "seed": args.seed,
        },
    }

    feature_schema_payload: dict[str, Any] = {
        "schema_version": "catboost_candidate_scorer_features.v1",
        "base_feature_schema_version": FEATURE_SCHEMA_VERSION,
        "model_family": MODEL_FAMILY,
        "allowed_source_blocks": ["pre_decision_features", "candidate_config"],
        "excluded_source_blocks": ["outcome", "delivered_config", "ids", "source"],
        "forbidden_fields": sorted(OUTCOME_FIELD_NAMES),
        "feature_columns": feature_names,
        "feature_count": len(feature_names),
        "categorical_feature_columns": [],
        "categorical_feature_count": 0,
        "excluded_feature_columns": sorted(EXCLUDED_FEATURE_NAMES),
        "target_names": list(TARGET_NAMES),
        "leakage_guard": {
            "uses_only_pre_decision_data": True,
            "outcome_fields_in_features": False,
        },
    }

    artifact_payload: dict[str, Any] = {
        "model_family": MODEL_FAMILY,
        "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
        "thesis_policy_id": THESIS_POLICY_ID,
        "source_dataset": str(input_path),
        "model_file": "model.cbm",
        "model_file_sha256": sha256_file(model_path),
        "feature_schema_file": "feature_schema.json",
        "metrics_file": "metrics.json",
        "target_schema_version": TARGET_SCHEMA_V2,
        "trained_at": utc_now_iso(),
        "seed": args.seed,
        "split_strategy": SPLIT_STRATEGY,
        "target_names": list(TARGET_NAMES),
        "primary_target": PRIMARY_LEARNING_GAIN_TARGET,
        "runtime_status": "runtime_pending",
        "runtime_compatible_with_current_typescript_loader": False,
        "leakage_guard": {
            "uses_only_pre_decision_data": True,
            "outcome_fields_in_features": False,
        },
    }

    write_json(metrics_path, metrics_payload)
    write_json(feature_schema_path, feature_schema_payload)
    write_json(artifact_path, artifact_payload)
    write_jsonl(
        parity_sample_path,
        build_parity_rows(test_rows, test_predictions, sample_size=args.parity_sample_size),
    )

    print(f"OK trained {MODEL_FAMILY}")
    print(f"model={model_path}")
    print(f"artifact={artifact_path}")
    print(
        "test_metrics="
        + json.dumps(
            {
                "learning_gain_target": PRIMARY_LEARNING_GAIN_TARGET,
                "learning_gain_rmse": metrics_payload["learning_gain_rmse"],
                "learning_gain_mae": metrics_payload["learning_gain_mae"],
                "next_step_success_accuracy": metrics_payload["next_step_success_accuracy"],
                "next_step_success_balanced_accuracy": metrics_payload["next_step_success_balanced_accuracy"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR {error}", file=sys.stderr)
        raise
