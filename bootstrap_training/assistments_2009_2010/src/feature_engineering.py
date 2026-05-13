from __future__ import annotations

import argparse
import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from common import build_paths, ensure_workspace_directories, load_config, save_json, to_native, utc_now_iso


@dataclass
class EntityStats:
    count: int = 0
    correct_sum: int = 0
    attempt_sum: float = 0.0
    hint_sum: float = 0.0
    log_response_sum: float = 0.0
    last_event_order: int | None = None
    last_timestamp: pd.Timestamp | None = None
    recent_correct: deque[float] = field(default_factory=deque)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate leakage-safe baseline features and reproducible split assignments."
    )
    parser.add_argument("--config", default=None, help="Path to workspace config JSON.")
    return parser.parse_args()


def safe_key(value: Any) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def safe_rate(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return np.nan
    return float(numerator / denominator)


def recent_mean(queue: deque[float], window: int) -> float:
    if not queue:
        return np.nan
    values = list(queue)[-window:]
    if not values:
        return np.nan
    return float(sum(values) / len(values))


def make_entity_stats(max_window: int) -> EntityStats:
    return EntityStats(recent_correct=deque(maxlen=max_window))


def build_feature_dataframe(df: pd.DataFrame, history_windows: list[int]) -> pd.DataFrame:
    max_window = max(history_windows)
    user_stats: dict[str, EntityStats] = {}
    skill_stats: dict[str, EntityStats] = {}
    user_skill_stats: dict[tuple[str, str], EntityStats] = {}

    feature_rows: dict[str, list[Any]] = defaultdict(list)

    ordered_df = df.sort_values("event_order", kind="stable").reset_index(drop=True)

    for row in ordered_df.itertuples(index=False):
        user_key = safe_key(getattr(row, "user_id", None))
        skill_key = safe_key(getattr(row, "skill_id", None))
        event_order = int(getattr(row, "event_order"))
        event_timestamp = getattr(row, "event_timestamp", pd.NaT)
        event_timestamp = None if pd.isna(event_timestamp) else event_timestamp
        correct_value = getattr(row, "correct")
        correct_float = float(correct_value) if not pd.isna(correct_value) else np.nan

        user_state = user_stats.get(user_key) if user_key else None
        skill_state = skill_stats.get(skill_key) if skill_key else None
        user_skill_state = (
            user_skill_stats.get((user_key, skill_key)) if user_key and skill_key else None
        )

        feature_rows["user_prior_interactions"].append(user_state.count if user_state else 0)
        feature_rows["user_prior_correct"].append(user_state.correct_sum if user_state else 0)
        feature_rows["user_prior_accuracy"].append(
            safe_rate(user_state.correct_sum, user_state.count) if user_state else np.nan
        )
        feature_rows["user_prior_mean_attempt_count"].append(
            safe_rate(user_state.attempt_sum, user_state.count) if user_state else np.nan
        )
        feature_rows["user_prior_mean_hint_count"].append(
            safe_rate(user_state.hint_sum, user_state.count) if user_state else np.nan
        )
        feature_rows["user_prior_mean_log_response_time"].append(
            safe_rate(user_state.log_response_sum, user_state.count) if user_state else np.nan
        )

        for window in history_windows:
            feature_rows[f"user_recent_accuracy_{window}"].append(
                recent_mean(user_state.recent_correct, window) if user_state else np.nan
            )

        feature_rows["skill_prior_interactions"].append(skill_state.count if skill_state else 0)
        feature_rows["skill_prior_correct"].append(skill_state.correct_sum if skill_state else 0)
        feature_rows["skill_prior_accuracy"].append(
            safe_rate(skill_state.correct_sum, skill_state.count) if skill_state else np.nan
        )
        for window in history_windows:
            feature_rows[f"skill_recent_accuracy_{window}"].append(
                recent_mean(skill_state.recent_correct, window) if skill_state else np.nan
            )

        feature_rows["user_skill_prior_interactions"].append(
            user_skill_state.count if user_skill_state else 0
        )
        feature_rows["user_skill_prior_correct"].append(
            user_skill_state.correct_sum if user_skill_state else 0
        )
        feature_rows["user_skill_prior_accuracy"].append(
            safe_rate(user_skill_state.correct_sum, user_skill_state.count)
            if user_skill_state
            else np.nan
        )

        if user_state and user_state.last_event_order is not None:
            feature_rows["user_gap_orders"].append(event_order - user_state.last_event_order)
        else:
            feature_rows["user_gap_orders"].append(np.nan)

        if user_skill_state and user_skill_state.last_event_order is not None:
            feature_rows["user_skill_gap_orders"].append(
                event_order - user_skill_state.last_event_order
            )
        else:
            feature_rows["user_skill_gap_orders"].append(np.nan)

        if user_state and user_state.last_timestamp is not None and event_timestamp is not None:
            feature_rows["user_gap_seconds"].append(
                max((event_timestamp - user_state.last_timestamp).total_seconds(), 0.0)
            )
        else:
            feature_rows["user_gap_seconds"].append(np.nan)

        if (
            user_skill_state
            and user_skill_state.last_timestamp is not None
            and event_timestamp is not None
        ):
            feature_rows["user_skill_gap_seconds"].append(
                max((event_timestamp - user_skill_state.last_timestamp).total_seconds(), 0.0)
            )
        else:
            feature_rows["user_skill_gap_seconds"].append(np.nan)

        feature_rows["log_position"].append(
            math.log1p(max(float(getattr(row, "position")), 0.0))
            if not pd.isna(getattr(row, "position"))
            else np.nan
        )
        feature_rows["log_opportunity"].append(
            math.log1p(max(float(getattr(row, "opportunity")), 0.0))
            if not pd.isna(getattr(row, "opportunity"))
            else np.nan
        )
        feature_rows["log_opportunity_original"].append(
            math.log1p(max(float(getattr(row, "opportunity_original")), 0.0))
            if not pd.isna(getattr(row, "opportunity_original"))
            else np.nan
        )

        if user_key:
            user_state = user_stats.setdefault(user_key, make_entity_stats(max_window))
            user_state.count += 1
            if not np.isnan(correct_float):
                user_state.correct_sum += int(correct_float)
                user_state.recent_correct.append(correct_float)
            if not pd.isna(getattr(row, "attempt_count", np.nan)):
                user_state.attempt_sum += float(getattr(row, "attempt_count"))
            if not pd.isna(getattr(row, "hint_count", np.nan)):
                user_state.hint_sum += float(getattr(row, "hint_count"))
            if not pd.isna(getattr(row, "ms_first_response", np.nan)):
                user_state.log_response_sum += math.log1p(
                    max(float(getattr(row, "ms_first_response")), 0.0)
                )
            user_state.last_event_order = event_order
            user_state.last_timestamp = event_timestamp

        if skill_key:
            skill_state = skill_stats.setdefault(skill_key, make_entity_stats(max_window))
            skill_state.count += 1
            if not np.isnan(correct_float):
                skill_state.correct_sum += int(correct_float)
                skill_state.recent_correct.append(correct_float)
            skill_state.last_event_order = event_order
            skill_state.last_timestamp = event_timestamp

        if user_key and skill_key:
            user_skill_state = user_skill_stats.setdefault(
                (user_key, skill_key), make_entity_stats(max_window)
            )
            user_skill_state.count += 1
            if not np.isnan(correct_float):
                user_skill_state.correct_sum += int(correct_float)
                user_skill_state.recent_correct.append(correct_float)
            user_skill_state.last_event_order = event_order
            user_skill_state.last_timestamp = event_timestamp

    return pd.concat([ordered_df, pd.DataFrame(feature_rows)], axis=1)


def assign_splits(df: pd.DataFrame, split_config: dict[str, Any]) -> tuple[pd.DataFrame, dict[str, Any]]:
    ordered_df = df.sort_values("event_order", kind="stable").reset_index(drop=True)
    total_rows = len(ordered_df)

    train_end = int(total_rows * split_config["train_fraction"])
    validation_end = train_end + int(total_rows * split_config["validation_fraction"])
    validation_end = min(validation_end, total_rows)

    split_labels = np.empty(total_rows, dtype=object)
    split_labels[:train_end] = "train"
    split_labels[train_end:validation_end] = "validation"
    split_labels[validation_end:] = "test"
    ordered_df["split"] = split_labels

    split_metadata = {
        "generated_at_utc": utc_now_iso(),
        "strategy": split_config["strategy"],
        "rationale": (
            "Global chronological split by interaction order was chosen over a user-disjoint split "
            "to preserve leakage-safe sequential history for the bootstrap next-step correctness baseline."
        ),
        "known_tradeoff": (
            "The same learner can appear in train/validation/test at later timestamps, so this evaluates "
            "future interactions of seen learners rather than pure cold-start generalization."
        ),
        "counts": {
            "total": int(total_rows),
            "train": int((ordered_df["split"] == "train").sum()),
            "validation": int((ordered_df["split"] == "validation").sum()),
            "test": int((ordered_df["split"] == "test").sum()),
        },
        "boundaries": {
            "train_end_event_order": int(ordered_df.iloc[train_end - 1]["event_order"])
            if train_end > 0
            else None,
            "validation_end_event_order": int(ordered_df.iloc[validation_end - 1]["event_order"])
            if validation_end > train_end
            else None,
        },
    }

    return ordered_df, split_metadata


def main() -> None:
    args = parse_args()
    config, _ = load_config(args.config)
    paths = build_paths(config)

    ensure_workspace_directories(paths)

    normalized_df = pd.read_parquet(paths["normalized_dataset"])
    feature_df = build_feature_dataframe(
        normalized_df, history_windows=config["baseline_features"]["history_windows"]
    )
    feature_df, split_metadata = assign_splits(feature_df, config["split"])

    current_numeric_features = config["baseline_features"]["current_numeric_features"]
    current_categorical_features = config["baseline_features"]["current_categorical_features"]
    derived_numeric_features = [
        "user_prior_interactions",
        "user_prior_correct",
        "user_prior_accuracy",
        "user_prior_mean_attempt_count",
        "user_prior_mean_hint_count",
        "user_prior_mean_log_response_time",
        "skill_prior_interactions",
        "skill_prior_correct",
        "skill_prior_accuracy",
        "user_skill_prior_interactions",
        "user_skill_prior_correct",
        "user_skill_prior_accuracy",
        "user_gap_orders",
        "user_skill_gap_orders",
        "user_gap_seconds",
        "user_skill_gap_seconds",
        "log_position",
        "log_opportunity",
        "log_opportunity_original",
    ] + [
        f"user_recent_accuracy_{window}" for window in config["baseline_features"]["history_windows"]
    ] + [
        f"skill_recent_accuracy_{window}" for window in config["baseline_features"]["history_windows"]
    ]

    feature_schema = {
        "generated_at_utc": utc_now_iso(),
        "target_columns": ["correct"],
        "identifier_columns": [
            "row_index",
            "event_order",
            "user_id",
            "assistment_id",
            "problem_id",
            "original",
            "assignment_id",
            "sequence_id",
            "student_class_id",
            "base_sequence_id",
            "teacher_id",
            "school_id",
            "template_id",
            "answer_id",
        ],
        "metadata_columns": [
            "skill_name",
            "first_action",
            "event_timestamp",
            "split",
        ],
        "categorical_feature_columns": current_categorical_features,
        "numeric_feature_columns": current_numeric_features + derived_numeric_features,
        "dropped_columns": config["baseline_features"]["drop_reasons"],
        "processed_dataset_path": str(paths["processed_dataset"]),
    }

    output_columns = (
        feature_schema["identifier_columns"]
        + feature_schema["metadata_columns"]
        + feature_schema["categorical_feature_columns"]
        + feature_schema["numeric_feature_columns"]
        + feature_schema["target_columns"]
    )
    output_columns = list(dict.fromkeys(column for column in output_columns if column in feature_df.columns))

    processed_df = feature_df[output_columns].copy()
    processed_df.to_parquet(paths["processed_dataset"], index=False)
    save_json(paths["feature_schema"], to_native(feature_schema))
    save_json(paths["split_metadata"], to_native(split_metadata))
    print(f"Saved processed feature dataset to: {paths['processed_dataset']}")


if __name__ == "__main__":
    main()
