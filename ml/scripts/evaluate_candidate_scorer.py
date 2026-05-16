#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import load_jsonl_dataset, validate_observation_record  # noqa: E402
from eduai_ml.training.artifact_loader import load_candidate_scorer_artifact  # noqa: E402
from eduai_ml.training.evaluator import evaluate_candidate_scorer  # noqa: E402
from eduai_ml.training.target_builder import DEFAULT_TARGET_SCHEMA_VERSION  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate EduAI candidate outcome scorer artifact.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--eval-out", required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument(
        "--split-strategy",
        default="observation_id_hash",
        choices=["observation_id_hash", "user_id_hash", "topic_id_hash", "time_ordered"],
    )
    args = parser.parse_args()

    records = load_jsonl_dataset(args.input)
    for record in records:
        validate_observation_record(record)
    _artifact, scorer = load_candidate_scorer_artifact(args.artifact)
    target_schema_version = (
        _artifact.get("target_definition", {}).get("target_schema_version")
        or DEFAULT_TARGET_SCHEMA_VERSION
    )
    report = evaluate_candidate_scorer(
        records,
        scorer,
        seed=args.seed,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        split_strategy=args.split_strategy,
        target_schema_version=str(target_schema_version),
    )
    output_path = Path(args.eval_out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    test_metrics = report["model_metrics"]["test"]
    print(
        "OK "
        + json.dumps(
            {
                "test_gain_mae": test_metrics["expected_learning_gain_proxy"]["mae"],
                "test_gain_rmse": test_metrics["expected_learning_gain_proxy"]["rmse"],
                "test_signed_gain_mae": test_metrics["expected_learning_gain_signed"]["mae"],
                "test_signed_gain_rmse": test_metrics["expected_learning_gain_signed"]["rmse"],
                "test_success_accuracy": test_metrics["expected_next_step_success"]["accuracy"],
                "split_strategy": report["split_strategy"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
