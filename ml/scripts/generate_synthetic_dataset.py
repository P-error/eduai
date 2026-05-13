#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_manifest import build_dataset_manifest, write_dataset_manifest  # noqa: E402
from eduai_ml.data.dataset_validation import write_jsonl_dataset  # noqa: E402
from eduai_ml.data.synthetic import generate_synthetic_observations  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate EduAI synthetic training observations.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--n-learners", type=int, required=True)
    parser.add_argument("--n-topics", type=int, required=True)
    parser.add_argument("--observations-per-learner", type=int, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--manifest-out")
    parser.add_argument("--candidate-strategy", choices=["bounded", "full_grid"], default="bounded")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    records = generate_synthetic_observations(
        n_learners=args.n_learners,
        n_topics=args.n_topics,
        observations_per_learner=args.observations_per_learner,
        seed=args.seed,
        candidate_strategy=args.candidate_strategy,
    )
    output_path = Path(args.out)
    write_jsonl_dataset(output_path, records)
    print(f"Wrote {len(records)} observations to {output_path}")

    if args.manifest_out:
        manifest = build_dataset_manifest(
            dataset_id=(
                f"synthetic_v1_seed_{args.seed}_"
                f"l{args.n_learners}_t{args.n_topics}_o{args.observations_per_learner}"
            ),
            source_kinds=["synthetic"],
            observation_count=len(records),
            files=[output_path],
            split_strategy=None,
            generation_config={
                "n_learners": args.n_learners,
                "n_topics": args.n_topics,
                "observations_per_learner": args.observations_per_learner,
                "seed": args.seed,
                "candidate_strategy": args.candidate_strategy,
            },
            limitations=[
                "Synthetic data does not prove real educational effect.",
                "Effective config is hidden generation metadata, not learner-declared preference.",
                "Synthetic v1 uses assigned delivered_config equal to candidate_config.",
            ],
            notes="Generated for candidate outcome scorer data-preparation validation.",
        )
        manifest_path = Path(args.manifest_out)
        write_dataset_manifest(manifest_path, manifest)
        print(f"Wrote manifest to {manifest_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
