from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Mapping, Sequence


MODEL_FAMILY = "catboost_candidate_scorer_v1"
ARTIFACT_SCHEMA_VERSION = "catboost_candidate_scorer_payload.v1"
ARTIFACT_PATH = Path(
    "artifacts/runtime/eduai_native_pedagogy/catboost_candidate_scorer_v1/artifact.json"
)
ALLOWED_SOURCE_BLOCKS = ["pre_decision_features", "candidate_config"]
FORBIDDEN_FIELDS = {
    "outcome",
    "delivered_config",
    "source",
    "ids",
    "postScore",
    "post_score",
    "nextStepSuccess",
    "next_step_success",
    "normalizedLearningGain",
    "normalized_learning_gain",
}
MAX_BODY_BYTES = 8 * 1024 * 1024

_RUNTIME_CACHE: dict[str, Any] | None = None


class ScorerInputError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class ScorerConfigError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def read_json_file(path: Path) -> Mapping[str, Any]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ScorerConfigError("invalid_json", f"Invalid JSON in {path.name}.") from error
    if not isinstance(parsed, dict):
        raise ScorerConfigError("invalid_json_object", f"{path.name} must be a JSON object.")
    return parsed


def read_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ScorerConfigError("invalid_string", f"{label} must be a non-empty string.")
    return value


def read_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ScorerConfigError("invalid_string_list", f"{label} must be a non-empty list.")
    if not all(isinstance(entry, str) and entry.strip() for entry in value):
        raise ScorerConfigError("invalid_string_list", f"{label} must contain strings.")
    return list(value)


def validate_artifact_and_schema(
    artifact_path: Path,
) -> tuple[Path, list[str], list[str]]:
    if not artifact_path.exists():
        raise ScorerConfigError("artifact_missing", "CatBoost artifact is missing.")

    artifact = read_json_file(artifact_path)
    if artifact.get("model_family") != MODEL_FAMILY:
        raise ScorerConfigError("model_family_mismatch", "CatBoost model family mismatch.")
    if artifact.get("artifact_schema_version") != ARTIFACT_SCHEMA_VERSION:
        raise ScorerConfigError(
            "schema_version_mismatch",
            "CatBoost artifact schema version mismatch.",
        )

    artifact_guard = artifact.get("leakage_guard")
    if not isinstance(artifact_guard, dict):
        raise ScorerConfigError("leakage_guard_missing", "CatBoost leakage guard is missing.")
    if artifact_guard.get("uses_only_pre_decision_data") is not True:
        raise ScorerConfigError("leakage_guard_failed", "CatBoost artifact uses unsafe data.")
    if artifact_guard.get("outcome_fields_in_features") is not False:
        raise ScorerConfigError("leakage_guard_failed", "CatBoost artifact includes outcomes.")

    artifact_dir = artifact_path.parent
    model_path = artifact_dir / read_string(artifact.get("model_file"), "model_file")
    feature_schema_path = artifact_dir / read_string(
        artifact.get("feature_schema_file"),
        "feature_schema_file",
    )
    if not model_path.exists():
        raise ScorerConfigError("model_missing", "CatBoost model file is missing.")
    if not feature_schema_path.exists():
        raise ScorerConfigError("feature_schema_missing", "CatBoost feature schema is missing.")

    feature_schema = read_json_file(feature_schema_path)
    if feature_schema.get("model_family") != MODEL_FAMILY:
        raise ScorerConfigError("feature_schema_family_mismatch", "Feature schema family mismatch.")
    leakage_guard = feature_schema.get("leakage_guard")
    if not isinstance(leakage_guard, dict):
        raise ScorerConfigError("feature_schema_guard_missing", "Feature schema guard is missing.")
    if leakage_guard.get("uses_only_pre_decision_data") is not True:
        raise ScorerConfigError("feature_schema_guard_failed", "Feature schema uses unsafe data.")
    if leakage_guard.get("outcome_fields_in_features") is not False:
        raise ScorerConfigError("feature_schema_guard_failed", "Feature schema includes outcomes.")
    if feature_schema.get("allowed_source_blocks") != ALLOWED_SOURCE_BLOCKS:
        raise ScorerConfigError(
            "feature_schema_source_blocks_failed",
            "Feature schema source blocks are invalid.",
        )

    feature_columns = read_string_list(
        feature_schema.get("feature_columns"),
        "feature_columns",
    )
    if feature_schema.get("feature_count") != len(feature_columns):
        raise ScorerConfigError("feature_count_mismatch", "Feature count mismatch.")

    target_names = read_string_list(artifact.get("target_names"), "target_names")
    schema_target_names = read_string_list(
        feature_schema.get("target_names"),
        "feature_schema.target_names",
    )
    if target_names != schema_target_names:
        raise ScorerConfigError("target_schema_mismatch", "Target schema mismatch.")

    return model_path, feature_columns, target_names


def load_runtime() -> Mapping[str, Any]:
    global _RUNTIME_CACHE
    if _RUNTIME_CACHE is not None:
        return _RUNTIME_CACHE

    try:
        from catboost import CatBoostRegressor
    except ImportError as error:
        raise ScorerConfigError("catboost_missing", "CatBoost dependency is unavailable.") from error

    artifact_path = repo_root() / ARTIFACT_PATH
    model_path, feature_columns, target_names = validate_artifact_and_schema(artifact_path)
    model = CatBoostRegressor()
    model.load_model(str(model_path))
    _RUNTIME_CACHE = {
        "model": model,
        "feature_columns": feature_columns,
        "target_names": target_names,
    }
    return _RUNTIME_CACHE


def read_number(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ScorerInputError("invalid_feature_value", "Feature values must be finite numbers.")
    numeric = float(value)
    if numeric != numeric or numeric in (float("inf"), float("-inf")):
        raise ScorerInputError("invalid_feature_value", "Feature values must be finite numbers.")
    return numeric


def read_rows(payload: Any) -> list[Mapping[str, Any]]:
    if not isinstance(payload, dict):
        raise ScorerInputError("invalid_payload", "Request body must be a JSON object.")
    if FORBIDDEN_FIELDS & set(payload.keys()):
        raise ScorerInputError("forbidden_payload_field", "Request body contains forbidden fields.")
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ScorerInputError("invalid_rows", "Request body must contain rows list.")
    if not rows:
        raise ScorerInputError("empty_rows", "Rows list must not be empty.")
    if not all(isinstance(row, dict) for row in rows):
        raise ScorerInputError("invalid_row", "Every row must be an object.")
    return rows


def vector_from_row(
    row: Mapping[str, Any],
    row_index: int,
    feature_columns: Sequence[str],
) -> list[float]:
    if FORBIDDEN_FIELDS & set(row.keys()):
        raise ScorerInputError("forbidden_row_field", "Row contains forbidden fields.")
    if set(row.keys()) != {"features"}:
        raise ScorerInputError("invalid_row_shape", "Each row must contain only features.")

    features = row.get("features")
    if not isinstance(features, dict):
        raise ScorerInputError("invalid_features", "Row features must be an object.")
    if FORBIDDEN_FIELDS & set(features.keys()):
        raise ScorerInputError("forbidden_feature_field", "Features contain forbidden fields.")

    actual_columns = set(features.keys())
    expected_columns = set(feature_columns)
    if expected_columns - actual_columns:
        raise ScorerInputError("missing_feature_columns", "Row is missing feature columns.")
    if actual_columns - expected_columns:
        raise ScorerInputError("unknown_feature_columns", "Row has unknown feature columns.")

    try:
        return [read_number(features[column]) for column in feature_columns]
    except ScorerInputError as error:
        raise ScorerInputError(error.code, f"Invalid feature value at row {row_index}.") from error


def prediction_rows(raw_predictions: Any) -> list[list[float]]:
    values = raw_predictions.tolist() if hasattr(raw_predictions, "tolist") else raw_predictions
    if not isinstance(values, list):
        raise ScorerConfigError("invalid_prediction_output", "CatBoost prediction output is invalid.")
    if not values:
        return []
    if isinstance(values[0], (int, float)):
        return [[float(value)] for value in values]
    return [[float(value) for value in row] for row in values]


def clamp_prediction(target_name: str, value: float) -> float:
    if target_name == "expected_learning_gain_signed":
        return max(-1.0, min(1.0, value))
    return max(0.0, min(1.0, value))


def build_predictions(raw_predictions: Any, target_names: Sequence[str]) -> list[dict[str, float]]:
    output: list[dict[str, float]] = []
    for row in prediction_rows(raw_predictions):
        if len(row) != len(target_names):
            raise ScorerConfigError("target_count_mismatch", "CatBoost target count mismatch.")
        output.append(
            {
                target_name: round(clamp_prediction(target_name, row[index]), 10)
                for index, target_name in enumerate(target_names)
            }
        )
    return output


def score_payload(payload: Any) -> Mapping[str, Any]:
    runtime = load_runtime()
    feature_columns = runtime["feature_columns"]
    target_names = runtime["target_names"]
    rows = read_rows(payload)
    vectors = [
        vector_from_row(row, row_index=index, feature_columns=feature_columns)
        for index, row in enumerate(rows)
    ]
    predictions = build_predictions(runtime["model"].predict(vectors), target_names)
    return {
        "ok": True,
        "model_family": MODEL_FAMILY,
        "feature_count": len(feature_columns),
        "prediction_count": len(predictions),
        "predictions": predictions,
    }


class handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_json(self, status: int, payload: Mapping[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _method_not_allowed(self) -> None:
        self._send_json(
            405,
            {
                "ok": False,
                "error": {
                    "code": "method_not_allowed",
                    "message": "Only POST is supported.",
                },
            },
        )

    def do_GET(self) -> None:
        self._method_not_allowed()

    def do_PUT(self) -> None:
        self._method_not_allowed()

    def do_PATCH(self) -> None:
        self._method_not_allowed()

    def do_DELETE(self) -> None:
        self._method_not_allowed()

    def do_OPTIONS(self) -> None:
        self._method_not_allowed()

    def do_POST(self) -> None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(
                400,
                {
                    "ok": False,
                    "error": {
                        "code": "invalid_content_length",
                        "message": "Content-Length is invalid.",
                    },
                },
            )
            return

        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._send_json(
                400,
                {
                    "ok": False,
                    "error": {
                        "code": "invalid_body_size",
                        "message": "Request body size is invalid.",
                    },
                },
            )
            return

        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
            self._send_json(200, score_payload(payload))
        except json.JSONDecodeError:
            self._send_json(
                400,
                {
                    "ok": False,
                    "error": {"code": "invalid_json", "message": "Request body is invalid JSON."},
                },
            )
        except ScorerInputError as error:
            self._send_json(
                400,
                {
                    "ok": False,
                    "error": {"code": error.code, "message": str(error)},
                },
            )
        except ScorerConfigError as error:
            self._send_json(
                500,
                {
                    "ok": False,
                    "error": {"code": error.code, "message": str(error)},
                },
            )
        except Exception:
            self._send_json(
                500,
                {
                    "ok": False,
                    "error": {
                        "code": "catboost_scorer_unavailable",
                        "message": "CatBoost scorer is unavailable.",
                    },
                },
            )
