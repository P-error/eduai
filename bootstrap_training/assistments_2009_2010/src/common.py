from __future__ import annotations

import hashlib
import json
from email.message import Message
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote

import pandas as pd


WORKSPACE_ROOT = Path(__file__).resolve().parents[1]


def default_config_path() -> Path:
    return WORKSPACE_ROOT / "configs" / "default.json"


def resolve_workspace_path(value: str | Path) -> Path:
    candidate = Path(value)
    if candidate.is_absolute():
        return candidate
    return WORKSPACE_ROOT / candidate


def load_config(config_path: str | Path | None = None) -> tuple[dict[str, Any], Path]:
    resolved_path = resolve_workspace_path(config_path or default_config_path())
    with resolved_path.open("r", encoding="utf-8") as handle:
        return json.load(handle), resolved_path


def build_paths(config: dict[str, Any]) -> dict[str, Path]:
    return {
        name: resolve_workspace_path(relative_path)
        for name, relative_path in config["paths"].items()
    }


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def ensure_workspace_directories(paths: dict[str, Path]) -> None:
    directory_keys = ["raw_dir", "interim_dir", "processed_dir", "artifacts_dir", "reports_dir"]
    for key in directory_keys:
        paths[key].mkdir(parents=True, exist_ok=True)


def save_json(path: Path, payload: Any) -> None:
    ensure_parent(path)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def save_text(path: Path, text: str) -> None:
    ensure_parent(path)
    path.write_text(text, encoding="utf-8")


def utc_now_iso() -> str:
    return pd.Timestamp.utcnow().isoformat()


def sha256_of_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def infer_filename_from_headers(headers: Message | dict[str, str] | None) -> str | None:
    if headers is None:
        return None
    content_disposition = headers.get("Content-Disposition")
    if not content_disposition:
        return None
    for item in content_disposition.split(";"):
        part = item.strip()
        if part.lower().startswith("filename="):
            value = part.split("=", 1)[1].strip().strip('"')
            return unquote(value)
    return None


def resolve_raw_dataset_path(config: dict[str, Any], paths: dict[str, Path]) -> Path:
    expected = paths["raw_dataset"]
    if expected.exists():
        return expected

    expected_name = config["dataset"]["expected_filename"]
    by_name = paths["raw_dir"] / expected_name
    if by_name.exists():
        return by_name

    csv_matches = sorted(paths["raw_dir"].glob("*.csv"))
    if not csv_matches:
        raise FileNotFoundError(
            f"Raw dataset file was not found in {paths['raw_dir']}. Run download_dataset.py first."
        )
    return csv_matches[0]


def read_raw_dataset(raw_path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(raw_path, low_memory=False, encoding="utf-8")
    except UnicodeDecodeError:
        return pd.read_csv(raw_path, low_memory=False, encoding="cp1252")


def _is_effectively_empty(series: pd.Series) -> bool:
    if series.isna().all():
        return True
    stringified = series.dropna().astype(str).str.strip()
    return stringified.eq("").all()


def clean_raw_dataframe(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    rename_map: dict[str, str] = {}
    dropped_columns: list[str] = []
    blank_columns: list[str] = []

    for index, column in enumerate(df.columns):
        raw_name = "" if column is None else str(column)
        cleaned_name = raw_name.strip()
        is_blank = cleaned_name == "" or cleaned_name.lower().startswith("unnamed")
        if is_blank and _is_effectively_empty(df[column]):
            dropped_columns.append(raw_name or f"<blank:{index}>")
            continue
        if cleaned_name == "":
            cleaned_name = f"unnamed_{index}"
            blank_columns.append(cleaned_name)
        rename_map[column] = cleaned_name

    cleaned = df.drop(columns=[column for column in df.columns if column not in rename_map]).rename(
        columns=rename_map
    )

    return cleaned, {
        "dropped_empty_columns": dropped_columns,
        "generated_blank_column_names": blank_columns,
        "renamed_columns": rename_map,
    }


def normalize_string_series(series: pd.Series) -> pd.Series:
    as_string = series.astype("string").str.strip()
    return as_string.mask(as_string.eq(""), pd.NA)


def coerce_numeric_columns(df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    for column in columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def parse_timestamp_column(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", utc=True, format="mixed")


def to_native(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): to_native(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [to_native(item) for item in value]
    if isinstance(value, tuple):
        return [to_native(item) for item in value]
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value
    return value


def format_markdown_table(rows: list[tuple[str, str]]) -> str:
    lines = ["| Field | Value |", "| --- | --- |"]
    for field, value in rows:
        safe_value = value.replace("\n", "<br>")
        lines.append(f"| {field} | {safe_value} |")
    return "\n".join(lines)


def prepare_model_inputs(
    df: pd.DataFrame, numeric_features: list[str], categorical_features: list[str]
) -> pd.DataFrame:
    feature_df = df[numeric_features + categorical_features].copy()

    for column in numeric_features:
        feature_df[column] = pd.to_numeric(feature_df[column], errors="coerce")

    for column in categorical_features:
        feature_df[column] = feature_df[column].astype(object)
        feature_df[column] = feature_df[column].where(pd.notna(feature_df[column]), None)

    return feature_df
