from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any, Iterable, Mapping

from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES, normalize_factor_config
from eduai_ml.validation import validate_training_observation

OUTCOME_FIELD_NAMES = {
    "pre_score",
    "post_score",
    "max_score",
    "next_step_success",
    "normalized_learning_gain",
    "outcome_available",
    "outcome",
    "postScore",
    "nextStepSuccess",
    "normalizedLearningGain",
    "outcomeAvailable",
}

SUPERVISED_TARGET_FIELDS = ("normalized_learning_gain", "next_step_success")


@dataclass(frozen=True)
class SupervisedTrainingReadiness:
    usable: bool
    reason: str | None


def validate_observation_record(record: Mapping[str, Any]) -> None:
    if not isinstance(record, Mapping):
        raise ValueError("record must be a JSON object")
    features = record.get("pre_decision_features")
    if not isinstance(features, Mapping):
        raise ValueError("pre_decision_features must be an object with pre-generation learner-state fields")
    leaked_fields = sorted(set(features.keys()) & OUTCOME_FIELD_NAMES)
    if leaked_fields:
        raise ValueError(
            "pre_decision_features contains post-generation outcome fields "
            f"{leaked_fields}; move them to outcome"
        )
    for block_name in ("candidate_config", "delivered_config"):
        try:
            normalize_factor_config(record.get(block_name, {}))
        except Exception as error:
            raise ValueError(f"{block_name} must contain all six valid factors: {error}") from error
    try:
        validate_training_observation(dict(record))
    except Exception as error:
        raise ValueError(f"training_observation.v1 schema violation: {error}") from error


def supervised_training_readiness(record: Mapping[str, Any]) -> SupervisedTrainingReadiness:
    outcome = record.get("outcome")
    if not isinstance(outcome, Mapping):
        return SupervisedTrainingReadiness(False, "outcome_block_missing")
    if outcome.get("outcome_available") is not True:
        return SupervisedTrainingReadiness(False, "outcome_unavailable")
    missing = [field for field in SUPERVISED_TARGET_FIELDS if outcome.get(field) is None]
    if missing:
        return SupervisedTrainingReadiness(False, f"missing_supervised_targets:{','.join(missing)}")
    return SupervisedTrainingReadiness(True, None)


def load_jsonl_dataset(path: str | Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        data = json.loads(line)
        if not isinstance(data, dict):
            raise ValueError(f"Line {line_number}: expected JSON object")
        records.append(data)
    return records


def write_jsonl_dataset(path: str | Path, records: Iterable[Mapping[str, Any]]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        for record in records:
            file.write(json.dumps(dict(record), ensure_ascii=False, sort_keys=True) + "\n")


def validate_jsonl_dataset(path: str | Path) -> dict[str, Any]:
    records = load_jsonl_dataset(path)
    errors: list[str] = []
    readiness_counts: Counter[str] = Counter()
    for index, record in enumerate(records, start=1):
        try:
            validate_observation_record(record)
        except Exception as error:
            errors.append(f"line {index}: {error}")
            continue
        readiness = supervised_training_readiness(record)
        readiness_counts["supervised_usable" if readiness.usable else str(readiness.reason)] += 1
    if errors:
        raise ValueError("; ".join(errors[:5]))
    supervised_usable = readiness_counts.get("supervised_usable", 0)
    return {
        "path": str(path),
        "observation_count": len(records),
        "valid": True,
        "supervised_usable_count": supervised_usable,
        "supervised_unusable_count": len(records) - supervised_usable,
        "supervised_unusable_reasons": {
            reason: count
            for reason, count in sorted(readiness_counts.items())
            if reason != "supervised_usable"
        },
    }


def _average(values: list[float]) -> float | None:
    return round(mean(values), 4) if values else None


def summarize_observations(records: Iterable[Mapping[str, Any]]) -> dict[str, Any]:
    materialized = list(records)
    source_kind_counts: Counter[str] = Counter()
    factor_distribution: dict[str, dict[str, int]] = {
        factor: {value: 0 for value in FACTOR_VALUES[factor]} for factor in FACTOR_NAMES
    }
    pre_scores: list[float] = []
    post_scores: list[float] = []
    gains: list[float] = []
    next_step_success_values: list[bool] = []
    outcome_available_count = 0
    supervised_usable_count = 0
    supervised_unusable_reasons: Counter[str] = Counter()
    leakage_guard_violations_count = 0

    for record in materialized:
        source_kind = record.get("source", {}).get("source_kind", "unknown")
        source_kind_counts[str(source_kind)] += 1

        candidate_config = record.get("candidate_config", {})
        if isinstance(candidate_config, Mapping):
            for factor in FACTOR_NAMES:
                value = candidate_config.get(factor)
                if value in factor_distribution[factor]:
                    factor_distribution[factor][str(value)] += 1

        outcome = record.get("outcome", {})
        if outcome.get("outcome_available") is True:
            outcome_available_count += 1
        if isinstance(outcome.get("pre_score"), (int, float)):
            pre_scores.append(float(outcome["pre_score"]))
        if isinstance(outcome.get("post_score"), (int, float)):
            post_scores.append(float(outcome["post_score"]))
        if isinstance(outcome.get("normalized_learning_gain"), (int, float)):
            gains.append(float(outcome["normalized_learning_gain"]))
        if isinstance(outcome.get("next_step_success"), bool):
            next_step_success_values.append(bool(outcome["next_step_success"]))
        readiness = supervised_training_readiness(record)
        if readiness.usable:
            supervised_usable_count += 1
        else:
            supervised_unusable_reasons[str(readiness.reason)] += 1

        features = record.get("pre_decision_features", {})
        if set(getattr(features, "keys", lambda: [])()) & OUTCOME_FIELD_NAMES:
            leakage_guard_violations_count += 1
        if record.get("leakage_guard", {}).get("uses_only_pre_decision_data") is not True:
            leakage_guard_violations_count += 1

    success_rate = (
        round(sum(1 for value in next_step_success_values if value) / len(next_step_success_values), 4)
        if next_step_success_values
        else None
    )

    return {
        "total_observations": len(materialized),
        "source_kind_counts": dict(sorted(source_kind_counts.items())),
        "outcome_available_count": outcome_available_count,
        "supervised_usable_count": supervised_usable_count,
        "supervised_unusable_count": len(materialized) - supervised_usable_count,
        "supervised_unusable_reasons": dict(sorted(supervised_unusable_reasons.items())),
        "factor_distribution": factor_distribution,
        "outcome_stats": {
            "average_pre_score": _average(pre_scores),
            "average_post_score": _average(post_scores),
            "average_normalized_learning_gain": _average(gains),
            "next_step_success_rate": success_rate,
        },
        "leakage_guard_violations_count": leakage_guard_violations_count,
    }
