from __future__ import annotations

import argparse
from typing import Any

import numpy as np
import pandas as pd

from common import (
    build_paths,
    clean_raw_dataframe,
    coerce_numeric_columns,
    ensure_workspace_directories,
    load_config,
    normalize_string_series,
    parse_timestamp_column,
    read_raw_dataset,
    resolve_raw_dataset_path,
    save_json,
    to_native,
    utc_now_iso,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize the raw dataset into a canonical interaction table.")
    parser.add_argument("--config", default=None, help="Path to workspace config JSON.")
    return parser.parse_args()


def choose_sort_strategy(df: pd.DataFrame) -> tuple[list[str], dict[str, Any]]:
    order_id_ratio = float(df["order_id"].notna().mean()) if "order_id" in df.columns else 0.0
    first_action_ratio = (
        float(df["event_timestamp"].notna().mean()) if "event_timestamp" in df.columns else 0.0
    )

    if first_action_ratio >= 0.95:
        sort_columns = ["event_timestamp", "order_id", "row_index"]
        rationale = (
            "Using parsed first_action timestamps as the primary chronological key with order_id and row_index as stable tie-breakers."
        )
    elif order_id_ratio >= 0.99:
        sort_columns = ["order_id", "row_index"]
        rationale = "Using order_id as the primary chronological-safe interaction order key."
    else:
        sort_columns = ["row_index"]
        rationale = "Falling back to file row order because no stronger ordering field was sufficiently complete."

    return sort_columns, {
        "order_id_available_ratio": round(order_id_ratio, 6),
        "event_timestamp_available_ratio": round(first_action_ratio, 6),
        "sort_columns": sort_columns,
        "rationale": rationale,
    }


def main() -> None:
    args = parse_args()
    config, _ = load_config(args.config)
    paths = build_paths(config)
    ensure_workspace_directories(paths)
    raw_dataset_path = resolve_raw_dataset_path(config, paths)

    raw_df = read_raw_dataset(raw_dataset_path)
    cleaned_df, cleaning_info = clean_raw_dataframe(raw_df)
    normalized_df = cleaned_df.copy()
    normalized_df["row_index"] = np.arange(len(normalized_df), dtype=np.int64)

    schema = config["schema"]

    for column in schema["identifier_columns"] + schema["text_columns"] + schema["timestamp_columns"]:
        if column in normalized_df.columns:
            normalized_df[column] = normalize_string_series(normalized_df[column])

    normalized_df = coerce_numeric_columns(normalized_df, schema["numeric_columns"])

    if "correct" not in normalized_df.columns:
        raise KeyError("Required target column `correct` is missing from the raw dataset.")

    normalized_df["correct"] = normalized_df["correct"].astype("Int64")
    timestamp_source = next(
        (column for column in schema["timestamp_columns"] if column in normalized_df.columns),
        None,
    )
    normalized_df["event_timestamp"] = (
        parse_timestamp_column(normalized_df[timestamp_source])
        if timestamp_source is not None
        else pd.Series(pd.NaT, index=normalized_df.index, dtype="datetime64[ns, UTC]")
    )

    sort_columns, ordering_metadata = choose_sort_strategy(normalized_df)
    sorted_index = normalized_df.sort_values(sort_columns, kind="stable").index
    event_order = pd.Series(np.arange(len(normalized_df), dtype=np.int64), index=sorted_index)
    normalized_df["event_order"] = event_order.sort_index().astype("Int64")

    output_columns = [
        "row_index",
        "event_order",
        *[column for column in normalized_df.columns if column not in {"row_index", "event_order"}],
    ]
    normalized_df = normalized_df[output_columns]
    normalized_df.to_parquet(paths["normalized_dataset"], index=False)

    preparation_metadata = {
        "generated_at_utc": utc_now_iso(),
        "raw_dataset_path": str(raw_dataset_path),
        "normalized_dataset_path": str(paths["normalized_dataset"]),
        "row_count": int(len(normalized_df)),
        "column_count": int(len(normalized_df.columns)),
        "cleaning": cleaning_info,
        "ordering": ordering_metadata,
        "column_roles": {
            "target": ["correct"],
            "identifiers": schema["identifier_columns"],
            "text": schema["text_columns"],
            "timestamps": schema["timestamp_columns"] + ["event_timestamp"],
            "numeric_signals": schema["numeric_columns"],
            "derived_metadata": ["row_index", "event_order"],
        },
    }
    save_json(paths["prepare_metadata"], to_native(preparation_metadata))
    print(f"Saved normalized dataset to: {paths['normalized_dataset']}")


if __name__ == "__main__":
    main()
