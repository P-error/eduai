from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import pandas as pd

from common import (
    build_paths,
    clean_raw_dataframe,
    ensure_workspace_directories,
    format_markdown_table,
    load_config,
    parse_timestamp_column,
    read_raw_dataset,
    resolve_raw_dataset_path,
    save_json,
    save_text,
    to_native,
    utc_now_iso,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect schema and summary statistics of the raw dataset.")
    parser.add_argument("--config", default=None, help="Path to workspace config JSON.")
    return parser.parse_args()


def summarize_column(
    column_name: str,
    series: pd.Series,
    timestamp_candidates: set[str],
) -> dict[str, Any]:
    non_null = int(series.notna().sum())
    null_count = int(series.isna().sum())
    summary: dict[str, Any] = {
        "pandas_dtype": str(series.dtype),
        "non_null_count": non_null,
        "null_count": null_count,
        "unique_non_null_count": int(series.nunique(dropna=True)),
        "sample_values": [str(value) for value in series.dropna().astype(str).head(5).tolist()],
    }

    numeric = pd.to_numeric(series, errors="coerce")
    numeric_non_null = int(numeric.notna().sum())
    if numeric_non_null > 0:
        summary["numeric_parse_ratio"] = round(numeric_non_null / max(len(series), 1), 6)
        summary["numeric_min"] = to_native(numeric.min())
        summary["numeric_max"] = to_native(numeric.max())

    if column_name in timestamp_candidates:
        timestamp = parse_timestamp_column(series)
        timestamp_non_null = int(timestamp.notna().sum())
        if timestamp_non_null > 0:
            summary["timestamp_parse_ratio"] = round(timestamp_non_null / max(len(series), 1), 6)
            summary["timestamp_min"] = to_native(timestamp.min())
            summary["timestamp_max"] = to_native(timestamp.max())

    return summary


def build_scope_validation(df: pd.DataFrame) -> dict[str, Any]:
    columns = set(df.columns)
    trainable = []
    unsupported = []

    if "correct" in columns:
        trainable.append(
            "Direct supervised target available: `correct` can be used as a next-step correctness / success proxy."
        )
    if {"user_id", "skill_id", "opportunity"}.intersection(columns):
        trainable.append(
            "Sequential user- and skill-history features are feasible because learner IDs, skill IDs, and opportunity counts are present."
        )

    unsupported.append(
        "No direct labels for `depth`, `tone`, `style`, `format`, or `optimal educational content` are present."
    )
    unsupported.append(
        "No direct supervised label for `difficulty` is present; only indirect performance- and item-level signals are available."
    )
    unsupported.append(
        "This dataset is suitable for a bootstrap correctness baseline, not as proof that EduAI-native optimal-content personalization is solved."
    )

    return {
        "task_framing_valid": True,
        "trainable_scope": trainable,
        "out_of_scope_or_not_directly_supervised": unsupported,
    }


def render_inspection_markdown(summary: dict[str, Any], scope_validation: dict[str, Any]) -> str:
    header_rows = [
        ("Generated At (UTC)", summary["generated_at_utc"]),
        ("Raw Dataset", summary["raw_dataset_path"]),
        ("Row Count", str(summary["row_count"])),
        ("Column Count (Cleaned)", str(summary["column_count"])),
        ("Dropped Empty Columns", ", ".join(summary["cleaning"]["dropped_empty_columns"]) or "None"),
    ]

    focus_lines = []
    for column_name in summary["focus_columns"]:
        if column_name in summary["columns"]:
            column_summary = summary["columns"][column_name]
            focus_lines.append(
                f"- `{column_name}`: dtype={column_summary['pandas_dtype']}, "
                f"non_null={column_summary['non_null_count']}, "
                f"unique={column_summary['unique_non_null_count']}"
            )
        else:
            focus_lines.append(f"- `{column_name}`: not present")

    scope_lines = ["# Task Scope Validation", ""]
    scope_lines.append("- Task framing is valid for an isolated bootstrap-training workspace.")
    scope_lines.extend(f"- {line}" for line in scope_validation["trainable_scope"])
    scope_lines.extend(
        f"- {line}" for line in scope_validation["out_of_scope_or_not_directly_supervised"]
    )

    return "\n".join(
        [
            "# Dataset Inspection Summary",
            "",
            format_markdown_table(header_rows),
            "",
            "## Focus Columns",
            *focus_lines,
            "",
            "## Ordering Candidates",
            *[
                f"- `{item['column']}` ({item['kind']}): usable_ratio={item['usable_ratio']}"
                for item in summary["ordering_candidates"]
            ],
            "",
            "## Trainable Scope",
            *[f"- {line}" for line in scope_validation["trainable_scope"]],
            "",
            "## Honest Limits",
            *[
                f"- {line}"
                for line in scope_validation["out_of_scope_or_not_directly_supervised"]
            ],
            "",
            "\n".join(scope_lines),
            "",
        ]
    )


def render_scope_markdown(scope_validation: dict[str, Any]) -> str:
    return "\n".join(
        [
            "# Task Scope Validation",
            "",
            "- Task framing is valid for an isolated bootstrap-training workspace.",
            *[f"- {line}" for line in scope_validation["trainable_scope"]],
            *[
                f"- {line}"
                for line in scope_validation["out_of_scope_or_not_directly_supervised"]
            ],
            "",
        ]
    )


def main() -> None:
    args = parse_args()
    config, _ = load_config(args.config)
    paths = build_paths(config)
    ensure_workspace_directories(paths)
    raw_dataset_path = resolve_raw_dataset_path(config, paths)

    raw_df = read_raw_dataset(raw_dataset_path)
    cleaned_df, cleaning_info = clean_raw_dataframe(raw_df)

    focus_columns = [
        "user_id",
        "problem_id",
        "assistment_id",
        "skill_id",
        "skill_name",
        "correct",
        "attempt_count",
        "hint_count",
        "ms_first_response",
        "overlap_time",
        "original",
        "opportunity",
        "opportunity_original",
        "first_action",
        "order_id",
    ]

    ordering_candidates = []
    if "order_id" in cleaned_df.columns:
        ordering_candidates.append(
            {
                "column": "order_id",
                "kind": "numeric_sequence",
                "usable_ratio": round(float(pd.to_numeric(cleaned_df["order_id"], errors="coerce").notna().mean()), 6),
            }
        )

    for column_name in config["schema"]["timestamp_columns"]:
        if column_name not in cleaned_df.columns:
            continue
        timestamp_ratio = float(parse_timestamp_column(cleaned_df[column_name]).notna().mean())
        if timestamp_ratio > 0:
            ordering_candidates.append(
                {
                    "column": column_name,
                    "kind": "timestamp",
                    "usable_ratio": round(timestamp_ratio, 6),
                }
            )

    summary = {
        "generated_at_utc": utc_now_iso(),
        "raw_dataset_path": str(raw_dataset_path),
        "row_count": int(len(cleaned_df)),
        "column_count": int(len(cleaned_df.columns)),
        "focus_columns": focus_columns,
        "ordering_candidates": ordering_candidates,
        "cleaning": cleaning_info,
        "columns": {
            column_name: summarize_column(
                column_name,
                cleaned_df[column_name],
                timestamp_candidates=set(config["schema"]["timestamp_columns"]),
            )
            for column_name in cleaned_df.columns
        },
    }

    scope_validation = build_scope_validation(cleaned_df)
    save_json(paths["inspection_summary_json"], to_native(summary))
    save_text(paths["inspection_summary_md"], render_inspection_markdown(summary, scope_validation))
    save_text(paths["scope_validation_md"], render_scope_markdown(scope_validation))
    print(f"Saved inspection report to: {paths['inspection_summary_json']}")


if __name__ == "__main__":
    main()
