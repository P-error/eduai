#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import load_jsonl_dataset, validate_observation_record  # noqa: E402
from eduai_ml.training.artifact_writer import write_model_artifact  # noqa: E402
from eduai_ml.training.target_builder import TARGET_SCHEMA_V1, TARGET_SCHEMA_V2  # noqa: E402
from eduai_ml.training.trainer import train_candidate_scorer  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train EduAI candidate outcome scorer.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--artifact-out", required=True)
    parser.add_argument("--eval-out", required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument("--test-ratio", type=float, default=0.15)
    parser.add_argument("--model-family", default="linear_candidate_scorer_v1")
    parser.add_argument("--model-variant", default="")
    parser.add_argument(
        "--target-schema-version",
        default=TARGET_SCHEMA_V1,
        choices=[TARGET_SCHEMA_V1, TARGET_SCHEMA_V2],
    )
    parser.add_argument(
        "--split-strategy",
        default="observation_id_hash",
        choices=["observation_id_hash", "user_id_hash", "topic_id_hash", "time_ordered"],
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records = load_jsonl_dataset(args.input)
    for record in records:
        validate_observation_record(record)

    result = train_candidate_scorer(
        records,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        test_ratio=args.test_ratio,
        model_family=args.model_family,
        model_variant=args.model_variant or None,
        split_strategy=args.split_strategy,
        target_schema_version=args.target_schema_version,
    )
    write_model_artifact(args.artifact_out, result.artifact)

    eval_path = Path(args.eval_out)
    eval_path.parent.mkdir(parents=True, exist_ok=True)
    eval_path.write_text(
        json.dumps(result.evaluation_report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    test_metrics = result.evaluation_report["model_metrics"]["test"]
    test_balance = result.evaluation_report["class_balance"]["test"]
    print(f"OK trained {args.model_family}")
    print(f"artifact={args.artifact_out}")
    print(f"eval={args.eval_out}")
    print(
        "test_metrics="
        + json.dumps(
            {
                "gain_mae": test_metrics["expected_learning_gain_proxy"]["mae"],
                "gain_rmse": test_metrics["expected_learning_gain_proxy"]["rmse"],
                "signed_gain_mae": test_metrics["expected_learning_gain_signed"]["mae"],
                "signed_gain_rmse": test_metrics["expected_learning_gain_signed"]["rmse"],
                "success_accuracy": test_metrics["expected_next_step_success"]["accuracy"],
                "success_balanced_accuracy": test_metrics["expected_next_step_success"]["balanced_accuracy"],
                "success_positive_rate": test_balance["positive_rate"],
                "combined_mae": test_metrics["combined_outcome_score"]["mae"],
                "split_strategy": result.evaluation_report["split_strategy"],
                "warnings": test_metrics["expected_next_step_success"]["warnings"] + test_balance["warnings"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
