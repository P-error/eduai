#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

MODEL_FAMILY = "catboost_candidate_scorer_v1"
ARTIFACT_SCHEMA_VERSION = "catboost_candidate_scorer_payload.v1"
FORBIDDEN_ROW_FIELDS = {"outcome", "delivered_config", "source", "ids"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score EduAI CatBoost candidate feature rows.")
    parser.add_argument("--artifact", required=True, help="Path to catboost artifact.json")
    parser.add_argument(
        "--input",
        default="-",
        help="Path to JSON/JSONL rows, or '-' for stdin. JSON may be a list or {rows: [...]}.",
    )
    return parser.parse_args()


def read_json(path: Path) -> Mapping[str, Any]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON in {path}: {error}") from error
    if not isinstance(parsed, dict):
        raise ValueError(f"Expected JSON object in {path}")
    return parsed


def read_input(input_arg: str) -> list[Mapping[str, Any]]:
    raw = sys.stdin.read() if input_arg == "-" else Path(input_arg).read_text(encoding="utf-8")
    stripped = raw.strip()
    if not stripped:
        raise ValueError("Input rows are empty")

    if stripped.startswith("[") or stripped.startswith("{"):
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError as error:
            if stripped.startswith("{") and "Extra data" in str(error):
                parsed = None
            else:
                raise ValueError(f"Invalid input JSON: {error}") from error
        if parsed is not None:
            if isinstance(parsed, dict):
                rows = parsed.get("rows")
            else:
                rows = parsed
            if not isinstance(rows, list):
                raise ValueError("Input JSON must be a row list or an object with rows list")
            if not all(isinstance(row, dict) for row in rows):
                raise ValueError("Every input row must be a JSON object")
            return list(rows)

    rows: list[Mapping[str, Any]] = []
    for line_number, line in enumerate(raw.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid JSONL on line {line_number}: {error}") from error
        if not isinstance(parsed, dict):
            raise ValueError(f"JSONL line {line_number} must be an object")
        rows.append(parsed)
    if not rows:
        raise ValueError("Input JSONL has no rows")
    return rows


def require_catboost() -> Any:
    try:
        from catboost import CatBoostRegressor
    except ImportError as error:
        raise RuntimeError(
            'Missing optional dependency "catboost". Install with: '
            'ml/.venv/bin/python -m pip install -e "ml[train]"'
        ) from error
    return CatBoostRegressor


def read_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def read_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{label} must be a non-empty list")
    if not all(isinstance(entry, str) and entry.strip() for entry in value):
        raise ValueError(f"{label} must contain only non-empty strings")
    return list(value)


def load_artifact_package(artifact_path: Path) -> tuple[Path, list[str], list[str]]:
    artifact = read_json(artifact_path)
    if artifact.get("model_family") != MODEL_FAMILY:
        raise ValueError(f"artifact.model_family must be {MODEL_FAMILY}")
    if artifact.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ValueError(f"artifact.artifact_schema_version must be {ARTIFACT_SCHEMA_VERSION}")

    artifact_dir = artifact_path.parent
    model_path = artifact_dir / read_string(artifact.get("model_file"), "artifact.model_file")
    feature_schema_path = artifact_dir / read_string(
        artifact.get("feature_schema_file"),
        "artifact.feature_schema_file",
    )
    if not model_path.exists():
        raise FileNotFoundError(f"CatBoost model file does not exist: {model_path}")
    if not feature_schema_path.exists():
        raise FileNotFoundError(f"feature_schema file does not exist: {feature_schema_path}")

    feature_schema = read_json(feature_schema_path)
    if feature_schema.get("model_family") != MODEL_FAMILY:
        raise ValueError(f"feature_schema.model_family must be {MODEL_FAMILY}")
    leakage_guard = feature_schema.get("leakage_guard")
    if not isinstance(leakage_guard, dict):
        raise ValueError("feature_schema.leakage_guard must be an object")
    if leakage_guard.get("uses_only_pre_decision_data") is not True:
        raise ValueError("feature_schema leakage guard does not allow runtime scoring")
    if leakage_guard.get("outcome_fields_in_features") is not False:
        raise ValueError("feature_schema permits outcome fields in features")
    if feature_schema.get("allowed_source_blocks") != ["pre_decision_features", "candidate_config"]:
        raise ValueError("feature_schema allowed_source_blocks must be pre_decision_features + candidate_config")

    feature_columns = read_string_list(feature_schema.get("feature_columns"), "feature_schema.feature_columns")
    target_names = read_string_list(artifact.get("target_names"), "artifact.target_names")
    schema_target_names = read_string_list(feature_schema.get("target_names"), "feature_schema.target_names")
    if target_names != schema_target_names:
        raise ValueError("artifact.target_names and feature_schema.target_names differ")
    declared_feature_count = feature_schema.get("feature_count")
    if declared_feature_count != len(feature_columns):
        raise ValueError(
            f"feature_schema.feature_count={declared_feature_count} does not match columns={len(feature_columns)}"
        )
    return model_path, feature_columns, target_names


def feature_mapping_from_row(row: Mapping[str, Any], row_index: int) -> Mapping[str, Any]:
    forbidden = sorted(FORBIDDEN_ROW_FIELDS & set(row.keys()))
    if forbidden:
        raise ValueError(f"row {row_index} contains forbidden non-feature fields: {', '.join(forbidden)}")
    features = row.get("features", row)
    if not isinstance(features, dict):
        raise ValueError(f"row {row_index} features must be an object")
    nested_forbidden = sorted(FORBIDDEN_ROW_FIELDS & set(features.keys()))
    if nested_forbidden:
        raise ValueError(f"row {row_index} features contain forbidden fields: {', '.join(nested_forbidden)}")
    return features


def vector_from_row(
    row: Mapping[str, Any],
    *,
    row_index: int,
    feature_columns: Sequence[str],
) -> list[float]:
    if "feature_values" in row:
        columns = row.get("feature_columns")
        if columns is not None and columns != list(feature_columns):
            raise ValueError(f"row {row_index} feature_columns order does not match feature_schema")
        values = row.get("feature_values")
        if not isinstance(values, list):
            raise ValueError(f"row {row_index} feature_values must be a list")
        if len(values) != len(feature_columns):
            raise ValueError(
                f"row {row_index} feature_values length={len(values)} expected={len(feature_columns)}"
            )
        return [read_number(value, f"row {row_index} feature_values[{index}]") for index, value in enumerate(values)]

    features = feature_mapping_from_row(row, row_index)
    actual_columns = set(features.keys())
    expected_columns = set(feature_columns)
    missing = sorted(expected_columns - actual_columns)
    extra = sorted(actual_columns - expected_columns)
    if missing:
        raise ValueError(f"row {row_index} is missing feature columns: {', '.join(missing[:10])}")
    if extra:
        raise ValueError(f"row {row_index} has unknown feature columns: {', '.join(extra[:10])}")
    return [read_number(features[column], f"row {row_index} feature {column}") for column in feature_columns]


def read_number(value: Any, label: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{label} must be a finite number")
    numeric = float(value)
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        raise ValueError(f"{label} must be finite")
    return numeric


def clamp_prediction(target_name: str, value: float) -> float:
    if target_name == "expected_learning_gain_signed":
        return max(-1.0, min(1.0, value))
    return max(0.0, min(1.0, value))


def prediction_rows(raw_predictions: Any) -> list[list[float]]:
    values = raw_predictions.tolist() if hasattr(raw_predictions, "tolist") else raw_predictions
    if not isinstance(values, list):
        raise ValueError("CatBoost prediction output is not a list")
    if not values:
        return []
    if isinstance(values[0], (int, float)):
        return [[float(value)] for value in values]
    return [[float(value) for value in row] for row in values]


def build_predictions(raw_predictions: Any, target_names: Sequence[str]) -> list[dict[str, float]]:
    output: list[dict[str, float]] = []
    for row in prediction_rows(raw_predictions):
        if len(row) != len(target_names):
            raise ValueError(f"CatBoost emitted {len(row)} targets; expected {len(target_names)}")
        output.append(
            {
                target_name: round(clamp_prediction(target_name, row[index]), 10)
                for index, target_name in enumerate(target_names)
            }
        )
    return output


def main() -> int:
    args = parse_args()
    artifact_path = Path(args.artifact)
    if not artifact_path.exists():
        raise FileNotFoundError(f"Artifact file does not exist: {artifact_path}")

    CatBoostRegressor = require_catboost()
    model_path, feature_columns, target_names = load_artifact_package(artifact_path)
    rows = read_input(args.input)
    vectors = [
        vector_from_row(row, row_index=index, feature_columns=feature_columns)
        for index, row in enumerate(rows)
    ]

    model = CatBoostRegressor()
    model.load_model(str(model_path))
    predictions = build_predictions(model.predict(vectors), target_names)
    print(
        json.dumps(
            {
                "ok": True,
                "model_family": MODEL_FAMILY,
                "feature_count": len(feature_columns),
                "prediction_count": len(predictions),
                "predictions": predictions,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ERROR {error}", file=sys.stderr)
        raise SystemExit(1)
