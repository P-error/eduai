#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.synthetic_counterfactual import (  # noqa: E402
    counterfactual_summary,
    generate_synthetic_counterfactual_states,
    write_counterfactual_jsonl,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate synthetic counterfactual ranking eval JSONL.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--n-learners", type=int, required=True)
    parser.add_argument("--n-topics", type=int, required=True)
    parser.add_argument("--states-per-learner", type=int, required=True)
    parser.add_argument("--max-candidates", type=int, required=True)
    parser.add_argument("--seed", type=int, required=True)
    args = parser.parse_args()

    states = generate_synthetic_counterfactual_states(
        n_learners=args.n_learners,
        n_topics=args.n_topics,
        states_per_learner=args.states_per_learner,
        max_candidates=args.max_candidates,
        seed=args.seed,
    )
    write_counterfactual_jsonl(args.out, states)
    print(f"Wrote {len(states)} counterfactual states to {args.out}")
    print(counterfactual_summary(states))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
