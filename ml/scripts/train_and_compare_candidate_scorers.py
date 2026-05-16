#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    load_jsonl_dataset,
    summarize_observations,
    validate_observation_record,
)
from eduai_ml.training.artifact_writer import build_model_artifact, write_model_artifact  # noqa: E402
from eduai_ml.training.evaluator import evaluate_candidate_scorer  # noqa: E402
from eduai_ml.training.target_builder import TARGET_SCHEMA_V2  # noqa: E402
from eduai_ml.training.trainer import TrainingResult, train_candidate_scorer  # noqa: E402
from eduai_ml.training.tree_scorer import TREE_MODEL_VARIANTS  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and compare EduAI candidate scorer model families.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--artifacts-dir", required=True)
    parser.add_argument("--reports-dir", required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--best-artifact-name", default="tree_candidate_scorer_v1_user_split_seed42.json")
    parser.add_argument("--best-eval-name", default="tree_candidate_scorer_v1_user_split_seed42_eval.json")
    return parser.parse_args()


def _has_sklearn() -> tuple[bool, str | None]:
    try:
        import sklearn
    except ImportError as error:
        return False, str(error)
    return True, str(sklearn.__version__)


def _time_ordered_available(records: list[Mapping[str, Any]]) -> bool:
    for record in records:
        timestamps = record.get("timestamps")
        if not isinstance(timestamps, Mapping) or not isinstance(timestamps.get("decision_created_at"), str):
            return False
    return True


def _safe_metric(value: Any) -> float:
    if value is None:
        return math.inf
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.inf


def _test_metric_row(
    *,
    model_family: str,
    model_variant: str | None,
    split_strategy: str,
    result: TrainingResult,
) -> dict[str, Any]:
    report = result.evaluation_report
    test_metrics = report["model_metrics"]["test"]
    success_metrics = test_metrics["expected_next_step_success"]
    clamped_gain = test_metrics["expected_learning_gain_proxy"]
    signed_gain = test_metrics["expected_learning_gain_signed"]
    combined = test_metrics["combined_outcome_score"]
    train_combined = report["model_metrics"]["train"]["combined_outcome_score"]
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
        "warnings": success_metrics["warnings"],
        "skipped_rows": result.skipped_rows,
    }


def _selection_key(row: Mapping[str, Any]) -> tuple[float, float, float]:
    return (
        _safe_metric(row.get("combined_outcome_score_rmse")),
        _safe_metric(row.get("signed_gain_rmse")),
        _safe_metric(row.get("next_step_success_log_loss")),
    )


def _write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(dict(payload), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _build_markdown(report: Mapping[str, Any]) -> str:
    rows = report["comparison_table"]
    lines = [
        "# THU Candidate Scorer Model Comparison",
        "",
        f"- Dataset: `{report['input']}`",
        f"- Seed: {report['seed']}",
        f"- Target schema: `{report['target_schema_version']}`",
        f"- sklearn: `{report['sklearn']['status']}`",
        f"- Best tree model: `{report['best_tree_model']['model_variant']}` on `{report['best_tree_model']['split_strategy']}`",
        "",
        "| model | split | signed RMSE | clamped RMSE | combined RMSE | success acc | balanced acc | log loss | majority acc |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        model = row["model_family"] if not row["model_variant"] else f"{row['model_family']}:{row['model_variant']}"
        lines.append(
            "| "
            + " | ".join(
                [
                    model,
                    row["split_strategy"],
                    str(row["signed_gain_rmse"]),
                    str(row["clamped_gain_rmse"]),
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
            "## Honest Interpretation",
            "",
            "- This is synthetic/simulation validation only.",
            "- Accuracy is not sufficient because next_step_success is imbalanced.",
            "- Runtime TypeScript integration for tree_candidate_scorer_v1 is not enabled by this script.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    records = load_jsonl_dataset(args.input)
    for record in records:
        validate_observation_record(record)

    sklearn_available, sklearn_version_or_error = _has_sklearn()
    split_strategies = ["user_id_hash", "observation_id_hash"]
    if _time_ordered_available(records):
        split_strategies.append("time_ordered")

    model_specs: list[tuple[str, str | None]] = [
        ("dummy_candidate_scorer_v1", "mean"),
        ("dummy_candidate_scorer_v1", "majority"),
        ("linear_candidate_scorer_v1", None),
    ]
    if sklearn_available:
        model_specs.extend(("tree_candidate_scorer_v1", variant) for variant in TREE_MODEL_VARIANTS)

    comparison_table: list[dict[str, Any]] = []
    result_by_key: dict[tuple[str, str | None, str], TrainingResult] = {}
    failures: list[dict[str, str]] = []

    for split_strategy in split_strategies:
        for model_family, model_variant in model_specs:
            try:
                result = train_candidate_scorer(
                    records,
                    seed=args.seed,
                    train_ratio=args.train_ratio,
                    validation_ratio=args.validation_ratio,
                    test_ratio=args.test_ratio,
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
                        "model_variant": str(model_variant),
                        "split_strategy": split_strategy,
                        "error": str(error),
                    }
                )
                continue
            key = (model_family, model_variant, split_strategy)
            result_by_key[key] = result
            comparison_table.append(
                _test_metric_row(
                    model_family=model_family,
                    model_variant=model_variant,
                    split_strategy=split_strategy,
                    result=result,
                )
            )

    tree_primary_rows = [
        row
        for row in comparison_table
        if row["model_family"] == "tree_candidate_scorer_v1" and row["split_strategy"] == "user_id_hash"
    ]
    if not tree_primary_rows:
        raise RuntimeError("No tree_candidate_scorer_v1 result was produced for user_id_hash split")
    best_tree_row = min(tree_primary_rows, key=_selection_key)
    best_key = (
        best_tree_row["model_family"],
        best_tree_row["model_variant"],
        best_tree_row["split_strategy"],
    )
    best_result = result_by_key[best_key]
    detailed_best_evaluation = evaluate_candidate_scorer(
        records,
        best_result.scorer,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        split_strategy=best_tree_row["split_strategy"],
        target_schema_version=TARGET_SCHEMA_V2,
        include_policy_diagnostics=True,
    )

    linear_primary = [
        row
        for row in comparison_table
        if row["model_family"] == "linear_candidate_scorer_v1" and row["split_strategy"] == "user_id_hash"
    ]
    best_dummy_primary = [
        row
        for row in comparison_table
        if row["model_family"] == "dummy_candidate_scorer_v1" and row["split_strategy"] == "user_id_hash"
    ]

    comparison_report: dict[str, Any] = {
        "schema_version": "candidate_scorer_model_comparison.v2",
        "input": args.input,
        "seed": args.seed,
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
            comparison_table,
            key=lambda row: (
                row["split_strategy"] != "user_id_hash",
                _selection_key(row),
                str(row["model_family"]),
                str(row["model_variant"]),
            ),
        ),
        "best_tree_model": best_tree_row,
        "primary_linear_baseline": linear_primary[0] if linear_primary else None,
        "primary_dummy_baselines": best_dummy_primary,
        "selection_criterion": [
            "primary split=user_id_hash",
            "lower test combined_outcome_score_rmse",
            "then lower signed_gain_rmse",
            "then lower next_step_success_log_loss",
        ],
        "failures": failures,
        "runtime_compatibility_decision": {
            "tree_candidate_scorer_v1": "offline-trained only",
            "runtime_scorer_implemented": False,
            "reason": (
                "The exported JSON contains full tree ensembles for several targets. "
                "Adding and validating a TypeScript tree traversal runtime is feasible but would change learner-facing serving and flags, so it is left out of this task."
            ),
            "linear_runtime_status": "unchanged",
        },
        "honesty_notes": [
            "The THU dataset used here is synthetic; this is not evidence of effectiveness on real learners.",
            "Negative normalized_learning_gain is preserved in expected_learning_gain_signed for v2 training/evaluation.",
            "Accuracy must be read against majority_class_accuracy and balanced_accuracy because the success class is imbalanced.",
        ],
    }

    best_eval_report = deepcopy(detailed_best_evaluation)
    best_eval_report["model_comparison"] = comparison_report
    best_eval_report["selected_best_tree_model"] = best_tree_row

    best_artifact = build_model_artifact(
        scorer=best_result.scorer,
        model_version=(
            f"{best_tree_row['model_family']}_{best_tree_row['model_variant']}_"
            f"{best_tree_row['split_strategy']}_seed_{args.seed}"
        ),
        training_data_summary=summarize_observations(records),
        evaluation_report=best_eval_report,
        seed=args.seed,
        split_strategy=best_tree_row["split_strategy"],
        model_family=str(best_tree_row["model_family"]),
        target_schema_version=TARGET_SCHEMA_V2,
        runtime_compatible=False,
        limitations=[
            "Artifact is trained on synthetic THU observations; this is simulation validation, not proof on real learners.",
            "tree_candidate_scorer_v1 is offline-trained only in this task; TypeScript runtime scorer is not implemented.",
            "Observed rows do not provide counterfactual outcomes for every possible candidate config.",
        ],
    )
    best_artifact["evaluation"]["model_comparison"] = {
        "schema_version": comparison_report["schema_version"],
        "selection_criterion": comparison_report["selection_criterion"],
        "best_tree_model": best_tree_row,
        "primary_linear_baseline": comparison_report["primary_linear_baseline"],
        "primary_dummy_baselines": comparison_report["primary_dummy_baselines"],
    }
    best_artifact["compatibility"]["runtime_compatible"] = False
    best_artifact["honesty_notes"] = comparison_report["honesty_notes"] + [
        "offline-trained only; runtime scorer not implemented for tree_candidate_scorer_v1",
    ]

    artifacts_dir = Path(args.artifacts_dir)
    reports_dir = Path(args.reports_dir)
    write_model_artifact(artifacts_dir / args.best_artifact_name, best_artifact)
    _write_json(artifacts_dir / args.best_eval_name, best_eval_report)
    _write_json(reports_dir / "candidate_scorer_model_comparison_seed42.json", comparison_report)
    (reports_dir / "candidate_scorer_model_comparison_seed42.md").write_text(
        _build_markdown(comparison_report),
        encoding="utf-8",
    )

    print(
        "OK "
        + json.dumps(
            {
                "best_tree_variant": best_tree_row["model_variant"],
                "best_tree_combined_rmse": best_tree_row["combined_outcome_score_rmse"],
                "best_tree_signed_rmse": best_tree_row["signed_gain_rmse"],
                "split": best_tree_row["split_strategy"],
                "comparison_rows": len(comparison_table),
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
