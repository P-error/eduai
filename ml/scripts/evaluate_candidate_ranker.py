#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.training.ranking_evaluator import evaluate_ranker_from_files  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate candidate scorer as synthetic ranker.")
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--counterfactual-input", required=True)
    parser.add_argument("--eval-out", required=True)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    report = evaluate_ranker_from_files(
        artifact_path=args.artifact,
        counterfactual_input_path=args.counterfactual_input,
        eval_out_path=args.eval_out,
        seed=args.seed,
    )
    print(
        "OK "
        + json.dumps(
            {
                "mean_top1_regret": report["ranking_metrics"]["mean_top1_regret"],
                "top1_match_rate": report["ranking_metrics"]["top1_match_rate"],
                "top3_contains_best_rate": report["ranking_metrics"]["top3_contains_best_rate"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
