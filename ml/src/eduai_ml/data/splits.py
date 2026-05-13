from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Iterable, Literal, Mapping

SplitName = Literal["train", "validation", "test"]
SplitStrategy = Literal[
    "observation_id_hash",
    "user_id_hash",
    "topic_id_hash",
    "time_ordered",
]

DEFAULT_SPLIT_STRATEGY: SplitStrategy = "observation_id_hash"
SPLIT_STRATEGIES: tuple[SplitStrategy, ...] = (
    "observation_id_hash",
    "user_id_hash",
    "topic_id_hash",
    "time_ordered",
)


def normalize_split_strategy(value: str | None) -> SplitStrategy:
    if value is None:
        return DEFAULT_SPLIT_STRATEGY
    normalized = value.strip().lower().replace("-", "_")
    aliases = {
        "observation": "observation_id_hash",
        "observation_id": "observation_id_hash",
        "deterministic_hash": "observation_id_hash",
        "user": "user_id_hash",
        "user_based": "user_id_hash",
        "user_hash": "user_id_hash",
        "topic": "topic_id_hash",
        "topic_based": "topic_id_hash",
        "topic_hash": "topic_id_hash",
        "time": "time_ordered",
        "time_based": "time_ordered",
        "chronological": "time_ordered",
    }
    normalized = aliases.get(normalized, normalized)
    if normalized not in SPLIT_STRATEGIES:
        allowed = ", ".join(SPLIT_STRATEGIES)
        raise ValueError(f"Unsupported split_strategy={value!r}; allowed: {allowed}")
    return normalized  # type: ignore[return-value]


def assign_deterministic_split(
    record: Mapping[str, Any],
    *,
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
    seed: int = 0,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
) -> str:
    strategy = normalize_split_strategy(split_strategy)
    if strategy == "time_ordered":
        raise ValueError("time_ordered split requires split_records_by_strategy")
    return assign_hash_split(
        split_key_for_record(record, strategy),
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        seed=seed,
    )


def assign_hash_split(
    split_key: str,
    *,
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
    seed: int = 0,
) -> SplitName:
    if train_ratio <= 0 or validation_ratio < 0 or train_ratio + validation_ratio >= 1:
        raise ValueError("Invalid split ratios")
    digest = hashlib.sha256(f"{seed}:{split_key}".encode("utf-8")).hexdigest()
    bucket = int(digest[:12], 16) / float(0xFFFFFFFFFFFF)
    if bucket < train_ratio:
        return "train"
    if bucket < train_ratio + validation_ratio:
        return "validation"
    return "test"


def split_key_for_record(record: Mapping[str, Any], split_strategy: str) -> str:
    strategy = normalize_split_strategy(split_strategy)
    ids = record.get("ids", {})
    if not isinstance(ids, Mapping):
        ids = {}
    if strategy == "observation_id_hash":
        return str(ids.get("observation_id") or "")
    if strategy == "user_id_hash":
        return str(ids.get("user_ref") or ids.get("observation_id") or "")
    if strategy == "topic_id_hash":
        return str(ids.get("topic_ref") or ids.get("observation_id") or "")
    raise ValueError("time_ordered split has no per-record hash key")


def _parse_timestamp(value: Any) -> tuple[int, str]:
    if not isinstance(value, str):
        return (1, "")
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return (1, value)
    return (0, parsed.isoformat())


def _record_time_sort_key(record: Mapping[str, Any]) -> tuple[tuple[int, str], str]:
    timestamps = record.get("timestamps", {})
    ids = record.get("ids", {})
    decision_created_at = timestamps.get("decision_created_at") if isinstance(timestamps, Mapping) else None
    observation_id = ids.get("observation_id") if isinstance(ids, Mapping) else ""
    return (_parse_timestamp(decision_created_at), str(observation_id or ""))


def split_records_by_strategy(
    records: Iterable[Mapping[str, Any]],
    *,
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
    seed: int = 0,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
) -> dict[SplitName, list[Mapping[str, Any]]]:
    strategy = normalize_split_strategy(split_strategy)
    materialized = list(records)
    split_records: dict[SplitName, list[Mapping[str, Any]]] = {
        "train": [],
        "validation": [],
        "test": [],
    }
    if train_ratio <= 0 or validation_ratio < 0 or train_ratio + validation_ratio >= 1:
        raise ValueError("Invalid split ratios")

    if strategy == "time_ordered":
        sorted_records = sorted(materialized, key=_record_time_sort_key)
        train_cutoff = int(len(sorted_records) * train_ratio)
        validation_cutoff = train_cutoff + int(len(sorted_records) * validation_ratio)
        for index, record in enumerate(sorted_records):
            if index < train_cutoff:
                split_records["train"].append(record)
            elif index < validation_cutoff:
                split_records["validation"].append(record)
            else:
                split_records["test"].append(record)
        return split_records

    for record in materialized:
        split = assign_hash_split(
            split_key_for_record(record, strategy),
            train_ratio=train_ratio,
            validation_ratio=validation_ratio,
            seed=seed,
        )
        split_records[split].append(record)
    return split_records


def build_split_assignments(
    records: Iterable[Mapping[str, Any]],
    *,
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
    seed: int = 0,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
) -> dict[str, str]:
    assignments: dict[str, str] = {}
    for split, split_rows in split_records_by_strategy(
        records,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        seed=seed,
        split_strategy=split_strategy,
    ).items():
        for record in split_rows:
            observation_id = str(record.get("ids", {}).get("observation_id", ""))
            assignments[observation_id] = split
    return assignments


def _ids_for_split(records: Iterable[Mapping[str, Any]], field_name: str) -> set[str]:
    values: set[str] = set()
    for record in records:
        ids = record.get("ids", {})
        if not isinstance(ids, Mapping):
            continue
        value = ids.get(field_name)
        if value is not None and str(value).strip():
            values.add(str(value))
    return values


def split_overlap_diagnostics(
    split_records: Mapping[str, Iterable[Mapping[str, Any]]],
    *,
    split_strategy: str,
) -> dict[str, Any]:
    materialized = {split: list(rows) for split, rows in split_records.items()}
    pair_names = (("train", "validation"), ("train", "test"), ("validation", "test"))
    diagnostics: dict[str, Any] = {
        "split_strategy": normalize_split_strategy(split_strategy),
        "warnings": [],
    }

    for field_name, label in (("user_ref", "users"), ("topic_ref", "topics")):
        split_sets = {
            split: _ids_for_split(rows, field_name)
            for split, rows in materialized.items()
        }
        overlap_counts: dict[str, int] = {}
        for left, right in pair_names:
            count = len(split_sets.get(left, set()) & split_sets.get(right, set()))
            overlap_counts[f"{left}_{right}"] = count
            if count > 0:
                diagnostics["warnings"].append(
                    f"{label}_overlap:{left}_{right}:{count}"
                )
        diagnostics[f"{label}_per_split"] = {
            split: len(values) for split, values in sorted(split_sets.items())
        }
        diagnostics[f"{label}_overlap_counts"] = overlap_counts

    diagnostics["split_sizes"] = {
        split: len(rows) for split, rows in sorted(materialized.items())
    }
    diagnostics["empty_split_warnings"] = [
        split for split, rows in sorted(materialized.items()) if not rows
    ]
    diagnostics["row_count_by_split"] = diagnostics["split_sizes"]
    return diagnostics
