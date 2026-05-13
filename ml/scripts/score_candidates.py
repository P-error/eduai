#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.factor_space import generate_bounded_candidate_set  # noqa: E402
from eduai_ml.training.artifact_loader import load_candidate_scorer_artifact  # noqa: E402


def _load_observation(raw: str) -> dict:
    path = Path(raw)
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("observation must be a JSON object")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description="Score bounded candidates for one observation.")
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--observation", required=True)
    parser.add_argument("--max-candidates", type=int, default=12)
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    artifact, scorer = load_candidate_scorer_artifact(args.artifact)
    observation = _load_observation(args.observation)
    base_candidate = observation["candidate_config"]
    candidates = generate_bounded_candidate_set(base_candidate, max_candidates=args.max_candidates)
    scored = []
    for candidate in candidates:
        candidate_observation = json.loads(json.dumps(observation))
        candidate_observation["candidate_config"] = candidate
        prediction = scorer.score_observation(candidate_observation)
        scored.append({"candidate_config": candidate, "prediction": prediction})
    scored.sort(key=lambda item: item["prediction"]["combined_outcome_score"], reverse=True)

    result = {
        "artifact_model_version": artifact["model_version"],
        "observation_id": observation.get("ids", {}).get("observation_id"),
        "used_outcome_fields": False,
        "candidate_count": len(scored),
        "top_candidates": scored[: min(args.top_k, len(scored))],
        "diagnostic_only": True,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
