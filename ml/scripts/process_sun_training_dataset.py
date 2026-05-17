#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Mapping

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    OUTCOME_FIELD_NAMES,
    summarize_observations,
    supervised_training_readiness,
    validate_observation_record,
    write_jsonl_dataset,
)
from eduai_ml.data.splits import split_overlap_diagnostics, split_records_by_strategy  # noqa: E402
from eduai_ml.factor_space import FACTOR_NAMES  # noqa: E402
from eduai_ml.training.artifact_loader import load_candidate_scorer_artifact  # noqa: E402
from eduai_ml.training.artifact_writer import build_model_artifact, write_model_artifact  # noqa: E402
from eduai_ml.training.evaluator import evaluate_candidate_scorer  # noqa: E402
from eduai_ml.training.feature_extraction import get_feature_names  # noqa: E402
from eduai_ml.training.target_builder import DEFAULT_TARGET_SCHEMA_VERSION, TARGET_SCHEMA_V2, build_targets  # noqa: E402
from eduai_ml.training.trainer import TrainingResult, train_candidate_scorer  # noqa: E402
from eduai_ml.training.tree_scorer import TREE_MODEL_VARIANTS  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process SUN synthetic training observations.")
    parser.add_argument("--input-dir", default="ml/src/eduai_ml/training/SUN")
    parser.add_argument(
        "--merged-output",
        default="ml/src/eduai_ml/training/SUN/merged/sun_training_observations_merged_v1.jsonl",
    )
    parser.add_argument("--artifacts-dir", default="ml/src/eduai_ml/training/SUN/artifacts/models")
    parser.add_argument("--reports-dir", default="ml/src/eduai_ml/training/SUN/artifacts/reports")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_jsonl_strict(path: Path) -> tuple[list[dict[str, Any]], list[str], int]:
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    empty_lines = 0
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            empty_lines += 1
            errors.append(f"{path.name}:{line_number}: empty line")
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as error:
            errors.append(f"{path.name}:{line_number}: invalid JSON: {error}")
            continue
        if not isinstance(parsed, dict):
            errors.append(f"{path.name}:{line_number}: line is not a JSON object")
            continue
        records.append(parsed)
    return records, errors, empty_lines


def is_training_observation_jsonl(path: Path, input_dir: Path) -> tuple[bool, str]:
    if path.parent != input_dir:
        return False, "nested output/artifact path"
    if path.suffix != ".jsonl":
        return False, "not JSONL"
    if "training_observations" not in path.name:
        return False, "name is not a training observations JSONL"
    return True, "training observations JSONL"


def config_key(config: Any) -> str:
    return json.dumps(config if isinstance(config, Mapping) else {}, ensure_ascii=False, sort_keys=True)


def distinct_count(records: list[Mapping[str, Any]], id_name: str) -> int:
    return len(
        {
            str(record.get("ids", {}).get(id_name))
            for record in records
            if isinstance(record.get("ids"), Mapping) and record.get("ids", {}).get(id_name)
        }
    )


def number_stats(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"min": None, "avg": None, "max": None}
    return {"min": min(values), "avg": mean(values), "max": max(values)}


def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def sequential_consistency(records: list[Mapping[str, Any]]) -> dict[str, Any]:
    by_user: dict[str, list[tuple[int, Mapping[str, Any]]]] = defaultdict(list)
    for index, record in enumerate(records):
        ids = record.get("ids", {})
        user_ref = str(ids.get("user_ref") or "") if isinstance(ids, Mapping) else ""
        by_user[user_ref].append((index, record))

    errors: list[dict[str, Any]] = []
    for user_ref, user_rows in sorted(by_user.items()):
        topic_seen: Counter[str] = Counter()
        previous_prior: int | None = None
        previous_session_position: int | None = None
        previous_timestamp: datetime | None = None
        for local_index, (_global_index, record) in enumerate(user_rows):
            ids = record.get("ids", {})
            features = record.get("pre_decision_features", {})
            timestamps = record.get("timestamps", {})
            observation_id = ids.get("observation_id") if isinstance(ids, Mapping) else None
            topic_ref = str(ids.get("topic_ref") or "") if isinstance(ids, Mapping) else ""
            prior_attempts = features.get("prior_attempts_count") if isinstance(features, Mapping) else None
            session_position = features.get("session_position") if isinstance(features, Mapping) else None
            topic_seen_count = features.get("topic_seen_count") if isinstance(features, Mapping) else None
            decision_created_at = (
                parse_timestamp(timestamps.get("decision_created_at"))
                if isinstance(timestamps, Mapping)
                else None
            )

            if prior_attempts != local_index:
                errors.append(
                    {
                        "kind": "prior_attempts_count_mismatch",
                        "user_ref": user_ref,
                        "observation_id": observation_id,
                        "expected": local_index,
                        "actual": prior_attempts,
                    }
                )
            if previous_prior is not None and isinstance(prior_attempts, int) and prior_attempts <= previous_prior:
                errors.append(
                    {
                        "kind": "prior_attempts_count_not_growing",
                        "user_ref": user_ref,
                        "observation_id": observation_id,
                        "previous": previous_prior,
                        "actual": prior_attempts,
                    }
                )
            if (
                previous_session_position is not None
                and isinstance(session_position, int)
                and session_position <= previous_session_position
            ):
                errors.append(
                    {
                        "kind": "session_position_not_growing",
                        "user_ref": user_ref,
                        "observation_id": observation_id,
                        "previous": previous_session_position,
                        "actual": session_position,
                    }
                )
            if topic_seen_count != topic_seen[topic_ref]:
                errors.append(
                    {
                        "kind": "topic_seen_count_mismatch",
                        "user_ref": user_ref,
                        "observation_id": observation_id,
                        "topic_ref": topic_ref,
                        "expected": topic_seen[topic_ref],
                        "actual": topic_seen_count,
                    }
                )
            if previous_timestamp is not None and decision_created_at is not None and decision_created_at < previous_timestamp:
                errors.append(
                    {
                        "kind": "timestamp_went_backwards",
                        "user_ref": user_ref,
                        "observation_id": observation_id,
                        "previous": previous_timestamp.isoformat(),
                        "actual": decision_created_at.isoformat(),
                    }
                )

            if isinstance(prior_attempts, int):
                previous_prior = prior_attempts
            if isinstance(session_position, int):
                previous_session_position = session_position
            if decision_created_at is not None:
                previous_timestamp = decision_created_at
            topic_seen[topic_ref] += 1

    return {
        "status": "passed" if not errors else "failed",
        "checked_user_count": len(by_user),
        "error_count": len(errors),
        "error_sample": errors[:50],
    }


def split_ready_diagnostics(
    records: list[Mapping[str, Any]],
    *,
    seed: int,
    train_ratio: float,
    validation_ratio: float,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for strategy in ("user_id_hash", "observation_id_hash", "time_ordered"):
        split_records = split_records_by_strategy(
            records,
            train_ratio=train_ratio,
            validation_ratio=validation_ratio,
            seed=seed,
            split_strategy=strategy,
        )
        diagnostics = split_overlap_diagnostics(split_records, split_strategy=strategy)
        ready = not diagnostics["empty_split_warnings"]
        if strategy == "user_id_hash":
            ready = ready and not any(diagnostics["users_overlap_counts"].values())
        result[strategy] = {
            "ready": ready,
            "split_sizes": diagnostics["split_sizes"],
            "diagnostics": diagnostics,
        }
    return result


def gain_sign_counts(values: list[float]) -> dict[str, int]:
    near_zero_threshold = 1e-9
    return {
        "negative": sum(1 for value in values if value < -near_zero_threshold),
        "near_zero": sum(1 for value in values if abs(value) <= near_zero_threshold),
        "positive": sum(1 for value in values if value > near_zero_threshold),
    }


def build_diagnostics(
    records: list[dict[str, Any]],
    *,
    input_path: Path,
    included_files: list[dict[str, Any]],
    excluded_files: list[dict[str, Any]],
    validation_errors: list[str],
    empty_line_count: int,
    duplicate_ids: list[str],
    candidate_delivered_mismatches: list[str],
    leakage_errors: list[str],
    target_errors: list[str],
    seed: int,
    train_ratio: float,
    validation_ratio: float,
) -> dict[str, Any]:
    subjects = distinct_count(records, "subject_ref")
    topics = distinct_count(records, "topic_ref")
    users = distinct_count(records, "user_ref")
    candidate_configs = Counter(config_key(record.get("candidate_config")) for record in records)
    success_positive = sum(1 for record in records if record.get("outcome", {}).get("next_step_success") is True)
    success_negative = sum(1 for record in records if record.get("outcome", {}).get("next_step_success") is False)
    gains = [
        float(record.get("outcome", {}).get("normalized_learning_gain"))
        for record in records
        if isinstance(record.get("outcome", {}).get("normalized_learning_gain"), (int, float))
    ]
    source_kind_distribution = Counter(str(record.get("source", {}).get("source_kind", "unknown")) for record in records)
    factor_distribution = {
        factor: dict(
            sorted(
                Counter(
                    str(record.get("candidate_config", {}).get(factor))
                    for record in records
                    if isinstance(record.get("candidate_config"), Mapping)
                ).items()
            )
        )
        for factor in FACTOR_NAMES
    }
    supervised_usable_count = sum(1 for record in records if supervised_training_readiness(record).usable)
    sequential = sequential_consistency(records)
    split_ready = split_ready_diagnostics(
        records,
        seed=seed,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
    )
    validation_status = (
        "passed"
        if not (
            validation_errors
            or empty_line_count
            or duplicate_ids
            or candidate_delivered_mismatches
            or leakage_errors
            or target_errors
        )
        else "failed"
    )
    return {
        "schema_version": "sun_training_observation_diagnostics.v1",
        "created_at": utc_now_iso(),
        "input": str(input_path),
        "included_files": included_files,
        "excluded_files": excluded_files,
        "row_count": len(records),
        "user_count": users,
        "subject_count": subjects,
        "topic_count": topics,
        "unique_candidate_config_count": len(candidate_configs),
        "split_ready_status": split_ready,
        "supervised_usable_count": supervised_usable_count,
        "validation": {
            "status": validation_status,
            "empty_line_count": empty_line_count,
            "validation_error_count": len(validation_errors),
            "validation_error_sample": validation_errors[:50],
            "duplicate_observation_id_count": len(duplicate_ids),
            "duplicate_observation_id_sample": duplicate_ids[:50],
            "candidate_delivered_mismatch_count": len(candidate_delivered_mismatches),
            "candidate_delivered_mismatch_sample": candidate_delivered_mismatches[:50],
            "target_error_count": len(target_errors),
            "target_error_sample": target_errors[:50],
            "leakage_error_count": len(leakage_errors),
            "leakage_error_sample": leakage_errors[:50],
            "target_schema_version": TARGET_SCHEMA_V2,
            "default_target_schema_version": DEFAULT_TARGET_SCHEMA_VERSION,
            "signed_gain_range_supported": bool(gains) and min(gains) >= -1.0 and max(gains) <= 1.0,
            "contains_negative_signed_gain": any(value < 0 for value in gains),
            "outcome_available_true_count": sum(
                1 for record in records if record.get("outcome", {}).get("outcome_available") is True
            ),
        },
        "next_step_success": {
            "positive": success_positive,
            "negative": success_negative,
        },
        "normalized_learning_gain": {
            **number_stats(gains),
            "sign_counts": gain_sign_counts(gains),
        },
        "factor_distribution": factor_distribution,
        "source_kind_distribution": dict(sorted(source_kind_distribution.items())),
        "sequential_consistency": sequential,
    }


def has_sklearn() -> tuple[bool, str | None]:
    try:
        import sklearn
    except ImportError as error:
        return False, str(error)
    return True, str(sklearn.__version__)


def safe_metric(value: Any) -> float:
    if value is None:
        return math.inf
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.inf


def test_metric_row(
    *,
    model_family: str,
    model_variant: str | None,
    split_strategy: str,
    result: TrainingResult,
) -> dict[str, Any]:
    report = result.evaluation_report
    test_metrics = report["model_metrics"]["test"]
    success_metrics = test_metrics["expected_next_step_success"]
    signed_gain = test_metrics["expected_learning_gain_signed"]
    clamped_gain = test_metrics["expected_learning_gain_proxy"]
    combined = test_metrics["combined_outcome_score"]
    train_combined = report["model_metrics"]["train"]["combined_outcome_score"]
    warnings = list(success_metrics["warnings"])
    warnings.extend(report.get("class_balance", {}).get("test", {}).get("warnings", []))
    return {
        "model_family": model_family,
        "model_variant": model_variant,
        "split_strategy": split_strategy,
        "target_schema_version": report["target_schema_version"],
        "train_rows": report["split_sizes"]["train"],
        "validation_rows": report["split_sizes"]["validation"],
        "test_rows": report["split_sizes"]["test"],
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
        "combined_rmse_generalization_gap": (
            round(combined["rmse"] - train_combined["rmse"], 6)
            if combined["rmse"] is not None and train_combined["rmse"] is not None
            else None
        ),
        "warnings": sorted(set(str(warning) for warning in warnings)),
        "skipped_rows": result.skipped_rows,
    }


def selection_key(row: Mapping[str, Any]) -> tuple[float, float, float]:
    return (
        safe_metric(row.get("combined_outcome_score_rmse")),
        safe_metric(row.get("signed_gain_rmse")),
        safe_metric(row.get("next_step_success_log_loss")),
    )


def write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(payload), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def model_label(row: Mapping[str, Any]) -> str:
    variant = row.get("model_variant")
    family = str(row["model_family"])
    return family if not variant else f"{family}:{variant}"


def train_and_compare(
    records: list[dict[str, Any]],
    *,
    seed: int,
    train_ratio: float,
    validation_ratio: float,
    test_ratio: float,
) -> tuple[dict[str, Any], dict[tuple[str, str | None, str], TrainingResult]]:
    sklearn_available, sklearn_version_or_error = has_sklearn()
    split_strategies = ["user_id_hash", "observation_id_hash", "time_ordered"]
    model_specs: list[tuple[str, str | None]] = [
        ("dummy_candidate_scorer_v1", "mean"),
        ("dummy_candidate_scorer_v1", "majority"),
        ("linear_candidate_scorer_v1", None),
    ]
    if sklearn_available:
        model_specs.extend(("tree_candidate_scorer_v1", variant) for variant in TREE_MODEL_VARIANTS)

    comparison_rows: list[dict[str, Any]] = []
    result_by_key: dict[tuple[str, str | None, str], TrainingResult] = {}
    failures: list[dict[str, str | None]] = []

    for split_strategy in split_strategies:
        for model_family, model_variant in model_specs:
            try:
                result = train_candidate_scorer(
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
            except Exception as error:
                failures.append(
                    {
                        "model_family": model_family,
                        "model_variant": model_variant,
                        "split_strategy": split_strategy,
                        "error": str(error),
                    }
                )
                continue
            key = (model_family, model_variant, split_strategy)
            result_by_key[key] = result
            comparison_rows.append(
                test_metric_row(
                    model_family=model_family,
                    model_variant=model_variant,
                    split_strategy=split_strategy,
                    result=result,
                )
            )

    primary_rows = [row for row in comparison_rows if row["split_strategy"] == "user_id_hash"]
    if not primary_rows:
        raise RuntimeError("No user_id_hash comparison rows were produced")
    best_offline = min(primary_rows, key=selection_key)
    runtime_rows = [
        row
        for row in primary_rows
        if row["model_family"] == "linear_candidate_scorer_v1"
    ]
    if not runtime_rows:
        raise RuntimeError("No linear_candidate_scorer_v1 row was produced for user_id_hash")
    best_runtime = min(runtime_rows, key=selection_key)

    comparison_report: dict[str, Any] = {
        "schema_version": "sun_candidate_scorer_model_comparison.v1",
        "created_at": utc_now_iso(),
        "seed": seed,
        "target_schema_version": TARGET_SCHEMA_V2,
        "training_data_summary": summarize_observations(records),
        "split_strategies": split_strategies,
        "model_specs": [
            {"model_family": family, "model_variant": variant}
            for family, variant in model_specs
        ],
        "sklearn": {
            "status": "available" if sklearn_available else "unavailable",
            "version_or_error": sklearn_version_or_error,
        },
        "comparison_table": sorted(
            comparison_rows,
            key=lambda row: (
                row["split_strategy"] != "user_id_hash",
                selection_key(row),
                str(row["model_family"]),
                str(row["model_variant"]),
            ),
        ),
        "best_offline_model": best_offline,
        "best_runtime_compatible_model": best_runtime,
        "selection_criterion": [
            "primary split=user_id_hash",
            "lower test combined_outcome_score_rmse",
            "then lower signed_gain_rmse",
            "then lower next_step_success_log_loss",
        ],
        "runtime_compatibility_decision": {
            "runtime_supported_model_family": "linear_candidate_scorer_v1",
            "runtime_supported_payload_schema_version": "linear_candidate_scorer_payload.v1",
            "tree_candidate_scorer_v1": "offline-only unless a TypeScript tree scorer is implemented and tested",
            "selected_runtime_model_family": "linear_candidate_scorer_v1",
        },
        "failures": failures,
        "honesty_notes": [
            "Synthetic SUN validation does not prove effectiveness on real learners.",
            "Observed rows do not provide full counterfactual labels for every possible candidate.",
            "Success accuracy is interpreted only with majority_class_accuracy and balanced_accuracy.",
        ],
    }
    return comparison_report, result_by_key


def build_selected_artifact(
    records: list[dict[str, Any]],
    result: TrainingResult,
    selected_row: Mapping[str, Any],
    comparison_report: Mapping[str, Any],
    *,
    seed: int,
    runtime_compatible: bool,
) -> tuple[dict[str, Any], dict[str, Any]]:
    detailed_eval = evaluate_candidate_scorer(
        records,
        result.scorer,
        seed=seed,
        train_ratio=0.7,
        validation_ratio=0.15,
        split_strategy=str(selected_row["split_strategy"]),
        target_schema_version=TARGET_SCHEMA_V2,
        include_policy_diagnostics=True,
    )
    selected_eval = deepcopy(detailed_eval)
    selected_eval["selected_model"] = dict(selected_row)
    selected_eval["model_comparison"] = comparison_report
    artifact = build_model_artifact(
        scorer=result.scorer,
        model_version=(
            f"{selected_row['model_family']}"
            f"{'_' + str(selected_row['model_variant']) if selected_row.get('model_variant') else ''}"
            f"_{selected_row['split_strategy']}_seed_{seed}"
        ),
        training_data_summary=summarize_observations(records),
        evaluation_report=selected_eval,
        seed=seed,
        split_strategy=str(selected_row["split_strategy"]),
        model_family=str(selected_row["model_family"]),
        target_schema_version=TARGET_SCHEMA_V2,
        runtime_compatible=runtime_compatible,
        limitations=[
            "Artifact is trained on synthetic SUN observations; this is simulation validation, not proof on real learners.",
            "Observed rows do not provide counterfactual outcomes for every possible candidate config.",
            (
                "tree_candidate_scorer_v1 is offline-only unless a dedicated TypeScript runtime scorer "
                "is implemented and tested."
            ),
        ],
    )
    artifact["evaluation"]["model_comparison"] = {
        "schema_version": comparison_report["schema_version"],
        "selection_criterion": comparison_report["selection_criterion"],
        "best_offline_model": comparison_report["best_offline_model"],
        "best_runtime_compatible_model": comparison_report["best_runtime_compatible_model"],
    }
    artifact["compatibility"]["runtime_compatible"] = runtime_compatible
    return artifact, selected_eval


def validate_runtime_artifact(path: Path) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as file:
        artifact = json.load(file)
    payload = artifact.get("model", {}).get("weights_or_serialized_payload", {})
    weights = payload.get("weights", {}) if isinstance(payload, Mapping) else {}
    expected_feature_names = get_feature_names()
    required_weights = (
        "expected_learning_gain_proxy",
        "expected_next_step_success_logit",
        "combined_outcome_score",
        "expected_learning_gain_signed",
    )
    checks.append(
        {
            "name": "payload_schema_version",
            "passed": payload.get("payload_schema_version") == "linear_candidate_scorer_payload.v1",
            "actual": payload.get("payload_schema_version"),
        }
    )
    checks.append(
        {
            "name": "feature_names",
            "passed": payload.get("feature_names") == expected_feature_names,
            "expected_count": len(expected_feature_names),
            "actual_count": len(payload.get("feature_names") or []),
        }
    )
    for weight_name in required_weights:
        value = weights.get(weight_name) if isinstance(weights, Mapping) else None
        checks.append(
            {
                "name": f"weights.{weight_name}",
                "passed": isinstance(value, list) and len(value) == len(expected_feature_names) + 1,
                "expected_width": len(expected_feature_names) + 1,
                "actual_width": len(value) if isinstance(value, list) else None,
            }
        )
    checks.append(
        {
            "name": "runtime_compatible_flag",
            "passed": artifact.get("compatibility", {}).get("runtime_compatible") is True,
            "actual": artifact.get("compatibility", {}).get("runtime_compatible"),
        }
    )
    try:
        _artifact, _scorer = load_candidate_scorer_artifact(path)
        python_loader_ok = True
        python_loader_error = None
    except Exception as error:
        python_loader_ok = False
        python_loader_error = str(error)
    checks.append(
        {
            "name": "python_artifact_loader",
            "passed": python_loader_ok,
            "error": python_loader_error,
        }
    )
    return {
        "schema_version": "sun_runtime_artifact_validation.v1",
        "artifact_path": str(path),
        "deployable": all(bool(check["passed"]) for check in checks),
        "checks": checks,
    }


def build_comparison_markdown(report: Mapping[str, Any]) -> str:
    rows = [row for row in report["comparison_table"] if row["split_strategy"] == "user_id_hash"]
    lines = [
        "# SUN Candidate Scorer Model Comparison",
        "",
        f"- Seed: {report['seed']}",
        f"- Target schema: `{report['target_schema_version']}`",
        f"- sklearn: `{report['sklearn']['status']}`",
        f"- Best offline model: `{model_label(report['best_offline_model'])}`",
        f"- Best runtime-compatible model: `{model_label(report['best_runtime_compatible_model'])}`",
        "",
        "| model | train | validation | test | signed RMSE | combined RMSE | success acc | balanced acc | log loss | majority acc |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    model_label(row),
                    str(row["train_rows"]),
                    str(row["validation_rows"]),
                    str(row["test_rows"]),
                    str(row["signed_gain_rmse"]),
                    str(row["combined_outcome_score_rmse"]),
                    str(row["next_step_success_accuracy"]),
                    str(row["next_step_success_balanced_accuracy"]),
                    str(row["next_step_success_log_loss"]),
                    str(row["majority_class_accuracy"]),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Honest Notes",
            "",
            "- Synthetic data only; no proof of real learner effectiveness.",
            "- No full counterfactual labels for every possible candidate.",
            "- Tree models remain offline-only unless a TypeScript tree runtime is implemented and tested.",
            "",
        ]
    )
    return "\n".join(lines)


def build_final_report(
    *,
    diagnostics: Mapping[str, Any],
    comparison: Mapping[str, Any],
    runtime_validation: Mapping[str, Any],
    commands: list[str],
    output_paths: Mapping[str, str],
    preflight: Mapping[str, Any],
) -> str:
    user_rows = [row for row in comparison["comparison_table"] if row["split_strategy"] == "user_id_hash"]
    lines = [
        "# SUN training dataset: merge, diagnostics, candidate scorer comparison",
        "",
        "## Краткий итог",
        "",
        f"- Объединение выполнено: да.",
        f"- Объединено файлов: {len(diagnostics['included_files'])}.",
        f"- Row count: {diagnostics['row_count']}.",
        f"- Users / subjects / topics: {diagnostics['user_count']} / {diagnostics['subject_count']} / {diagnostics['topic_count']}.",
        f"- Unique candidate_config: {diagnostics['unique_candidate_config_count']}.",
        f"- Validation status: `{diagnostics['validation']['status']}`.",
        f"- Sequential consistency: `{diagnostics['sequential_consistency']['status']}`.",
        (
            "- Success balance: "
            f"{diagnostics['next_step_success']['positive']} positive / "
            f"{diagnostics['next_step_success']['negative']} negative."
        ),
        (
            "- Gain min/avg/max: "
            f"{diagnostics['normalized_learning_gain']['min']} / "
            f"{diagnostics['normalized_learning_gain']['avg']} / "
            f"{diagnostics['normalized_learning_gain']['max']}."
        ),
        "",
        "## Проверка задачи перед выполнением",
        "",
        f"- SUN input dir exists: `{preflight['input_dir_exists']}`.",
        f"- Training observation JSONL files found: {preflight['training_observation_jsonl_count']}.",
        f"- Архивы/профили/diagnostics включены: нет.",
        f"- Target schema: `{preflight['target_schema_version']}`.",
        f"- Runtime-compatible scorer в TypeScript: `{preflight['runtime_compatible_scorer']}`.",
        f"- Основной риск: {preflight['main_risk']}",
        "",
        "## Модели",
        "",
        "- Обучены: dummy mean, dummy majority, linear_candidate_scorer_v1"
        + (
            ", tree random_forest, tree extra_trees, tree gradient_boosting."
            if comparison["sklearn"]["status"] == "available"
            else ". Tree-модели пропущены: sklearn недоступен."
        ),
        f"- Best offline model: `{model_label(comparison['best_offline_model'])}`.",
        f"- Best runtime-compatible model: `{model_label(comparison['best_runtime_compatible_model'])}`.",
        f"- Runtime artifact deployable: `{runtime_validation['deployable']}`.",
        "",
        "## User split comparison",
        "",
        "| model | train | validation | test | signed RMSE | combined RMSE | success acc | balanced acc | log loss | majority acc |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in user_rows:
        lines.append(
            "| "
            + " | ".join(
                [
                    model_label(row),
                    str(row["train_rows"]),
                    str(row["validation_rows"]),
                    str(row["test_rows"]),
                    str(row["signed_gain_rmse"]),
                    str(row["combined_outcome_score_rmse"]),
                    str(row["next_step_success_accuracy"]),
                    str(row["next_step_success_balanced_accuracy"]),
                    str(row["next_step_success_log_loss"]),
                    str(row["majority_class_accuracy"]),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Артефакты",
            "",
        ]
    )
    for name, path in output_paths.items():
        lines.append(f"- {name}: `{path}`")
    lines.extend(
        [
            "",
            "## Команды",
            "",
        ]
    )
    lines.extend(f"- `{command}`" for command in commands)
    lines.extend(
        [
            "",
            "## Проверки",
            "",
            f"- JSONL/schema validation: `{diagnostics['validation']['status']}`.",
            f"- Duplicate observation_id: {diagnostics['validation']['duplicate_observation_id_count']}.",
            f"- Leakage errors: {diagnostics['validation']['leakage_error_count']}.",
            f"- Candidate/delivered mismatch: {diagnostics['validation']['candidate_delivered_mismatch_count']}.",
            f"- Sequential consistency: `{diagnostics['sequential_consistency']['status']}`.",
            f"- Runtime linear artifact validation: `{'passed' if runtime_validation['deployable'] else 'failed'}`.",
            "",
            "## Честные ограничения",
            "",
            "- Synthetic data only: результаты не доказывают реальную эффективность на учениках.",
            "- Нет full counterfactual labels для всех возможных candidate_config.",
            "- Tree-модель может быть лучшей offline, но остаётся offline-only без TypeScript tree scorer и тестов.",
            "- Runtime-compatible выбор ограничен текущим TypeScript loader/scorer: linear_candidate_scorer_v1.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    input_dir = (REPO_ROOT / args.input_dir).resolve()
    merged_output = (REPO_ROOT / args.merged_output).resolve()
    artifacts_dir = (REPO_ROOT / args.artifacts_dir).resolve()
    reports_dir = (REPO_ROOT / args.reports_dir).resolve()
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    merged_output.parent.mkdir(parents=True, exist_ok=True)

    included_files: list[dict[str, Any]] = []
    excluded_files: list[dict[str, Any]] = []
    records: list[dict[str, Any]] = []
    validation_errors: list[str] = []
    target_errors: list[str] = []
    leakage_errors: list[str] = []
    candidate_delivered_mismatches: list[str] = []
    observation_ids: set[str] = set()
    duplicate_ids: list[str] = []
    empty_line_count = 0

    if not input_dir.exists() or not input_dir.is_dir():
        raise FileNotFoundError(f"SUN input directory not found: {input_dir}")

    for path in sorted(p for p in input_dir.rglob("*") if p.is_file()):
        include, reason = is_training_observation_jsonl(path, input_dir)
        if not include:
            excluded_files.append({"file": path.name, "path": str(path), "reason": reason})
            continue
        file_records, read_errors, empty_lines = read_jsonl_strict(path)
        empty_line_count += empty_lines
        validation_errors.extend(read_errors)
        valid_rows_for_file = 0
        for index, record in enumerate(file_records, start=1):
            line_label = f"{path.name}:{index}"
            try:
                validate_observation_record(record)
            except Exception as error:
                validation_errors.append(f"{line_label}: {error}")
                continue
            try:
                build_targets(record, target_schema_version=TARGET_SCHEMA_V2)
            except Exception as error:
                target_errors.append(f"{line_label}: {error}")
            ids = record.get("ids", {})
            observation_id = str(ids.get("observation_id") or "") if isinstance(ids, Mapping) else ""
            if not observation_id:
                validation_errors.append(f"{line_label}: missing observation_id")
            elif observation_id in observation_ids:
                duplicate_ids.append(observation_id)
            observation_ids.add(observation_id)
            if record.get("candidate_config") != record.get("delivered_config"):
                candidate_delivered_mismatches.append(observation_id or line_label)
            features = record.get("pre_decision_features", {})
            leaked_fields = sorted(set(features.keys()) & OUTCOME_FIELD_NAMES) if isinstance(features, Mapping) else []
            guard_ok = record.get("leakage_guard", {}).get("uses_only_pre_decision_data") is True
            if leaked_fields or not guard_ok:
                leakage_errors.append(f"{observation_id or line_label}: leaked_fields={leaked_fields}; guard_ok={guard_ok}")
            valid_rows_for_file += 1
            records.append(record)
        included_files.append(
            {
                "file": path.name,
                "path": str(path),
                "rows": len(file_records),
                "valid_rows_loaded": valid_rows_for_file,
                "reason": reason,
            }
        )

    preflight = {
        "input_dir_exists": input_dir.exists() and input_dir.is_dir(),
        "input_dir": str(input_dir),
        "training_observation_jsonl_count": len(included_files),
        "included_files": included_files,
        "excluded_files": excluded_files,
        "target_schema_version": TARGET_SCHEMA_V2,
        "default_target_schema_version": DEFAULT_TARGET_SCHEMA_VERSION,
        "pipeline_contract": "train_candidate_scorer/evaluator support dummy, linear, and tree scorers with v2 signed gain targets",
        "runtime_compatible_scorer": "linear_candidate_scorer_v1",
        "runtime_payload_schema": "linear_candidate_scorer_payload.v1",
        "main_risk": "SUN is synthetic; offline metrics are not real learner effectiveness evidence.",
    }

    if validation_errors or target_errors or duplicate_ids or candidate_delivered_mismatches or leakage_errors:
        diagnostics = build_diagnostics(
            records,
            input_path=merged_output,
            included_files=included_files,
            excluded_files=excluded_files,
            validation_errors=validation_errors,
            empty_line_count=empty_line_count,
            duplicate_ids=duplicate_ids,
            candidate_delivered_mismatches=candidate_delivered_mismatches,
            leakage_errors=leakage_errors,
            target_errors=target_errors,
            seed=args.seed,
            train_ratio=args.train_ratio,
            validation_ratio=args.validation_ratio,
        )
        write_json(reports_dir / "sun_training_observation_diagnostics.json", diagnostics)
        raise RuntimeError("Preflight validation failed; diagnostics were written.")

    write_jsonl_dataset(merged_output, records)
    diagnostics = build_diagnostics(
        records,
        input_path=merged_output,
        included_files=included_files,
        excluded_files=excluded_files,
        validation_errors=validation_errors,
        empty_line_count=empty_line_count,
        duplicate_ids=duplicate_ids,
        candidate_delivered_mismatches=candidate_delivered_mismatches,
        leakage_errors=leakage_errors,
        target_errors=target_errors,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
    )
    diagnostics["preflight"] = preflight
    write_json(reports_dir / "sun_training_observation_diagnostics.json", diagnostics)

    comparison_report, result_by_key = train_and_compare(
        records,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        test_ratio=args.test_ratio,
    )
    write_json(reports_dir / "sun_candidate_scorer_model_comparison_seed42.json", comparison_report)
    (reports_dir / "sun_candidate_scorer_model_comparison_seed42.md").write_text(
        build_comparison_markdown(comparison_report),
        encoding="utf-8",
    )

    best_offline_row = comparison_report["best_offline_model"]
    best_runtime_row = comparison_report["best_runtime_compatible_model"]
    best_offline_key = (
        str(best_offline_row["model_family"]),
        best_offline_row.get("model_variant"),
        str(best_offline_row["split_strategy"]),
    )
    best_runtime_key = (
        str(best_runtime_row["model_family"]),
        best_runtime_row.get("model_variant"),
        str(best_runtime_row["split_strategy"]),
    )
    best_offline_artifact, best_offline_eval = build_selected_artifact(
        records,
        result_by_key[best_offline_key],
        best_offline_row,
        comparison_report,
        seed=args.seed,
        runtime_compatible=best_offline_row["model_family"] == "linear_candidate_scorer_v1",
    )
    if best_offline_row["model_family"] != "linear_candidate_scorer_v1":
        best_offline_artifact["compatibility"]["runtime_compatible"] = False
        best_offline_artifact["honesty_notes"].append(
            "Best offline model is not deployable in the current TypeScript runtime."
        )
    best_runtime_artifact, best_runtime_eval = build_selected_artifact(
        records,
        result_by_key[best_runtime_key],
        best_runtime_row,
        comparison_report,
        seed=args.seed,
        runtime_compatible=True,
    )

    best_offline_artifact_path = artifacts_dir / "sun_best_offline_candidate_scorer_seed42.json"
    best_offline_eval_path = artifacts_dir / "sun_best_offline_candidate_scorer_seed42_eval.json"
    best_runtime_artifact_path = artifacts_dir / "sun_best_runtime_linear_candidate_scorer_seed42.json"
    best_runtime_eval_path = artifacts_dir / "sun_best_runtime_linear_candidate_scorer_seed42_eval.json"
    write_model_artifact(best_offline_artifact_path, best_offline_artifact)
    write_json(best_offline_eval_path, best_offline_eval)
    write_model_artifact(best_runtime_artifact_path, best_runtime_artifact)
    write_json(best_runtime_eval_path, best_runtime_eval)
    runtime_validation = validate_runtime_artifact(best_runtime_artifact_path)
    write_json(reports_dir / "sun_runtime_linear_candidate_scorer_seed42_validation.json", runtime_validation)

    output_paths = {
        "merged_dataset": str(merged_output),
        "diagnostics": str(reports_dir / "sun_training_observation_diagnostics.json"),
        "best_offline_artifact": str(best_offline_artifact_path),
        "best_offline_eval": str(best_offline_eval_path),
        "best_runtime_artifact": str(best_runtime_artifact_path),
        "best_runtime_eval": str(best_runtime_eval_path),
        "comparison_json": str(reports_dir / "sun_candidate_scorer_model_comparison_seed42.json"),
        "comparison_markdown": str(reports_dir / "sun_candidate_scorer_model_comparison_seed42.md"),
        "runtime_validation": str(reports_dir / "sun_runtime_linear_candidate_scorer_seed42_validation.json"),
        "final_report": str(reports_dir / "codex_report_sun_training.md"),
    }
    commands = [
        (
            "ml/.venv/bin/python ml/scripts/process_sun_training_dataset.py "
            "--input-dir ml/src/eduai_ml/training/SUN "
            "--merged-output ml/src/eduai_ml/training/SUN/merged/sun_training_observations_merged_v1.jsonl "
            "--artifacts-dir ml/src/eduai_ml/training/SUN/artifacts/models "
            "--reports-dir ml/src/eduai_ml/training/SUN/artifacts/reports "
            f"--seed {args.seed}"
        )
    ]
    final_report = build_final_report(
        diagnostics=diagnostics,
        comparison=comparison_report,
        runtime_validation=runtime_validation,
        commands=commands,
        output_paths=output_paths,
        preflight=preflight,
    )
    (reports_dir / "codex_report_sun_training.md").write_text(final_report, encoding="utf-8")

    legacy_comparison_json = reports_dir / "candidate_scorer_model_comparison_seed42.json"
    legacy_comparison_md = reports_dir / "candidate_scorer_model_comparison_seed42.md"
    shutil.copyfile(reports_dir / "sun_candidate_scorer_model_comparison_seed42.json", legacy_comparison_json)
    shutil.copyfile(reports_dir / "sun_candidate_scorer_model_comparison_seed42.md", legacy_comparison_md)

    print(
        "OK "
        + json.dumps(
            {
                "rows": diagnostics["row_count"],
                "files": len(included_files),
                "best_offline_model": model_label(best_offline_row),
                "best_runtime_model": model_label(best_runtime_row),
                "runtime_deployable": runtime_validation["deployable"],
                "report": str(reports_dir / "codex_report_sun_training.md"),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
