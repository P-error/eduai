#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Mapping

ML_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES, normalize_factor_config  # noqa: E402
from eduai_ml.guardrails import filter_unsafe_six_factor_candidates  # noqa: E402
from eduai_ml.training.artifact_loader import load_candidate_scorer_artifact  # noqa: E402

FORBIDDEN_FEATURE_FIELDS = {
    "pre_score",
    "post_score",
    "max_score",
    "next_step_success",
    "normalized_learning_gain",
    "outcome_available",
    "outcome",
    "user_ref",
    "user_id",
    "userRef",
    "userId",
}

STATIC_RUNTIME_BASELINE = {
    "difficulty": "medium",
    "depth": "standard",
    "support_level": "guided",
    "presentation_format": "step_by_step",
    "examples_level": "single",
    "terminology_level": "balanced",
}

RUNTIME_EXPLORATION_CONFIGS = (
    {
        "difficulty": "easy",
        "depth": "detailed",
        "support_level": "scaffolded",
        "presentation_format": "step_by_step",
        "examples_level": "multiple",
        "terminology_level": "simple",
    },
    {
        "difficulty": "medium",
        "depth": "standard",
        "support_level": "guided",
        "presentation_format": "qa",
        "examples_level": "single",
        "terminology_level": "balanced",
    },
    {
        "difficulty": "hard",
        "depth": "brief",
        "support_level": "minimal",
        "presentation_format": "paragraph",
        "examples_level": "none",
        "terminology_level": "technical",
    },
    {
        "difficulty": "hard",
        "depth": "standard",
        "support_level": "guided",
        "presentation_format": "structured_list",
        "examples_level": "single",
        "terminology_level": "technical",
    },
    {
        "difficulty": "easy",
        "depth": "brief",
        "support_level": "guided",
        "presentation_format": "structured_list",
        "examples_level": "single",
        "terminology_level": "simple",
    },
)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            raise ValueError(f"Empty line at {path}:{line_number}")
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"JSONL row must be an object at {path}:{line_number}")
        records.append(value)
    return records


def sample_records(
    records: list[dict[str, Any]],
    *,
    sample_size: int,
    sample_mode: str,
    seed: int,
) -> list[dict[str, Any]]:
    if sample_size >= len(records):
        return records
    if sample_mode == "random":
        rng = random.Random(seed)
        indexes = sorted(rng.sample(range(len(records)), sample_size))
        return [records[index] for index in indexes]
    return records[:sample_size]


def finite_or_none(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(float(value)):
        return None
    return float(value)


def clamp01(value: float | None) -> float | None:
    if value is None:
        return None
    return max(0.0, min(1.0, value))


def enum_or_none(value: Any, factor: str) -> str | None:
    return value if isinstance(value, str) and value in FACTOR_VALUES[factor] else None


def candidate_key(candidate: Mapping[str, Any]) -> str:
    normalized = normalize_factor_config(candidate)
    return "|".join(normalized[factor] for factor in FACTOR_NAMES)


def append_unique(
    output: list[dict[str, str]],
    seen: set[str],
    candidate: Mapping[str, Any],
    max_candidates: int,
) -> None:
    if len(output) >= max_candidates:
        return
    normalized = normalize_factor_config(candidate)
    key = candidate_key(normalized)
    if key in seen:
        return
    seen.add(key)
    output.append(normalized)


def neighboring_values(factor: str, current: str) -> list[str]:
    values = FACTOR_VALUES[factor]
    if current not in values:
        return [values[0]]
    index = values.index(current)
    result = [current]
    if index > 0:
        result.append(values[index - 1])
    if index < len(values) - 1:
        result.append(values[index + 1])
    return result


def add_nearby_candidates(
    output: list[dict[str, str]],
    seen: set[str],
    base: Mapping[str, str],
    max_candidates: int,
) -> None:
    for factor in FACTOR_NAMES:
        for value in neighboring_values(factor, base[factor]):
            candidate = dict(base)
            candidate[factor] = value
            append_unique(output, seen, candidate, max_candidates)


def runtime_like_heuristic_candidate(pre: Mapping[str, Any], base: Mapping[str, Any]) -> dict[str, str]:
    difficulty = (
        enum_or_none(base.get("difficulty"), "difficulty")
        or enum_or_none(pre.get("declared_preference_difficulty"), "difficulty")
        or STATIC_RUNTIME_BASELINE["difficulty"]
    )
    depth = (
        enum_or_none(base.get("depth"), "depth")
        or enum_or_none(pre.get("declared_preference_depth"), "depth")
        or STATIC_RUNTIME_BASELINE["depth"]
    )
    recent_correct_rate = clamp01(finite_or_none(pre.get("recent_correct_rate")))
    band = (
        "unknown"
        if recent_correct_rate is None
        else "low"
        if recent_correct_rate < 0.45
        else "high"
        if recent_correct_rate >= 0.8
        else "medium"
    )
    support_level = (
        "scaffolded"
        if band == "low" or depth == "detailed"
        else "minimal"
        if band == "high" and depth == "brief"
        else "guided"
    )
    presentation_format = (
        "paragraph"
        if band == "high" and depth == "brief" and difficulty == "hard"
        else "structured_list"
        if band == "high" and depth == "brief"
        else "step_by_step"
    )
    examples_level = (
        "multiple"
        if band == "low" or depth == "detailed"
        else "none"
        if band == "high" and depth == "brief"
        else "single"
    )
    terminology_level = (
        "simple"
        if band == "low" or difficulty == "easy"
        else "technical"
        if band == "high" and difficulty == "hard"
        else "balanced"
    )
    return {
        "difficulty": difficulty,
        "depth": depth,
        "support_level": support_level,
        "presentation_format": presentation_format,
        "examples_level": examples_level,
        "terminology_level": terminology_level,
    }


def runtime_like_candidate_set(
    record: Mapping[str, Any],
    *,
    max_candidates: int,
) -> list[dict[str, str]]:
    pre = record.get("pre_decision_features")
    if not isinstance(pre, Mapping):
        raise ValueError("record.pre_decision_features must be an object")
    base_raw = record.get("delivered_config") or record.get("candidate_config") or STATIC_RUNTIME_BASELINE
    base = normalize_factor_config(base_raw)
    heuristic = runtime_like_heuristic_candidate(pre, base)
    output: list[dict[str, str]] = []
    seen: set[str] = set()

    append_unique(output, seen, STATIC_RUNTIME_BASELINE, max_candidates)
    append_unique(output, seen, heuristic, max_candidates)
    append_unique(output, seen, base, max_candidates)
    add_nearby_candidates(output, seen, base, max_candidates)
    add_nearby_candidates(output, seen, heuristic, max_candidates)
    for candidate in RUNTIME_EXPLORATION_CONFIGS:
        append_unique(output, seen, candidate, max_candidates)
    return output


def scorer_observation(
    record: Mapping[str, Any],
    candidate: Mapping[str, Any],
    *,
    source_kind: str,
) -> dict[str, Any]:
    ids = record.get("ids") if isinstance(record.get("ids"), Mapping) else {}
    pre = record.get("pre_decision_features")
    if not isinstance(pre, Mapping):
        raise ValueError("record.pre_decision_features must be an object")
    return {
        "ids": {
            "user_ref": ids.get("user_ref") or "unknown_user",
            "subject_ref": ids.get("subject_ref") or "unknown_subject",
            "topic_ref": ids.get("topic_ref") or ids.get("subject_ref") or "unknown_topic",
        },
        "source": {"source_kind": source_kind},
        "pre_decision_features": dict(pre),
        "candidate_config": normalize_factor_config(candidate),
    }


def summarize_distribution(configs: list[Mapping[str, str]]) -> dict[str, dict[str, int]]:
    return {
        factor: dict(Counter(config[factor] for config in configs))
        for factor in FACTOR_NAMES
    }


def summarize_scores(scores: list[float]) -> dict[str, float | None]:
    if not scores:
        return {"min": None, "mean": None, "max": None}
    return {
        "min": round(min(scores), 6),
        "mean": round(statistics.fmean(scores), 6),
        "max": round(max(scores), 6),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Quick THU scorer shadow/dry-run smoke check.")
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--sample-size", type=int, default=100)
    parser.add_argument("--sample-mode", choices=("first", "random"), default="first")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--max-candidates", type=int, default=30)
    parser.add_argument("--source-kind", choices=("real_user", "synthetic"), default="real_user")
    parser.add_argument("--output")
    args = parser.parse_args()

    artifact_path = Path(args.artifact)
    dataset_path = Path(args.dataset)
    artifact, scorer = load_candidate_scorer_artifact(artifact_path)
    payload = artifact["model"]["weights_or_serialized_payload"]
    feature_names = list(payload["feature_names"])
    forbidden = sorted(set(feature_names) & FORBIDDEN_FEATURE_FIELDS)
    candidate_fields = list(artifact.get("candidate_schema", {}).get("required_factors") or [])
    if sorted(candidate_fields) != sorted(FACTOR_NAMES):
        raise ValueError(f"Artifact candidate fields mismatch: {candidate_fields}")

    records = sample_records(
        read_jsonl(dataset_path),
        sample_size=args.sample_size,
        sample_mode=args.sample_mode,
        seed=args.seed,
    )
    if not records:
        raise ValueError("No rows selected for shadow check")

    top_configs: list[dict[str, str]] = []
    predicted_scores: list[float] = []
    nan_or_inf_count = 0
    delivered_match_count = 0
    candidate_counts: list[int] = []
    guardrail_filtered_total = 0
    guardrail_fallback_count = 0

    for record in records:
        candidates = runtime_like_candidate_set(record, max_candidates=args.max_candidates)
        pre = record["pre_decision_features"]
        guardrail_result = filter_unsafe_six_factor_candidates(pre, candidates)
        guardrail_filtered_total += guardrail_result.filtered_count
        if guardrail_result.fallback_used:
            guardrail_fallback_count += 1
        candidate_counts.append(len(guardrail_result.candidates))

        best_candidate: dict[str, str] | None = None
        best_score = -math.inf
        for candidate in guardrail_result.candidates:
            prediction = scorer.score_observation(
                scorer_observation(record, candidate, source_kind=args.source_kind)
            )
            score = prediction["combined_outcome_score"]
            if not math.isfinite(score):
                nan_or_inf_count += 1
                continue
            if score > best_score:
                best_score = score
                best_candidate = dict(candidate)

        if best_candidate is None:
            nan_or_inf_count += 1
            continue
        top_configs.append(best_candidate)
        predicted_scores.append(best_score)
        delivered = record.get("delivered_config")
        if isinstance(delivered, Mapping) and candidate_key(delivered) == candidate_key(best_candidate):
            delivered_match_count += 1

    summary = {
        "artifact_path": str(artifact_path),
        "dataset_path": str(dataset_path),
        "loaded": True,
        "model_version": artifact.get("model_version"),
        "model_type": artifact.get("model", {}).get("model_family"),
        "feature_count": len(feature_names),
        "candidate_config_fields": candidate_fields,
        "forbidden_fields_found": forbidden,
        "score_range_expected": "0..1",
        "sample_size": len(records),
        "sample_mode": args.sample_mode,
        "source_kind_for_scoring": args.source_kind,
        "max_candidates": args.max_candidates,
        "candidate_count_min": min(candidate_counts) if candidate_counts else None,
        "candidate_count_mean": round(statistics.fmean(candidate_counts), 3) if candidate_counts else None,
        "candidate_count_max": max(candidate_counts) if candidate_counts else None,
        "unique_top1_configs": len({candidate_key(config) for config in top_configs}),
        "predicted_score": summarize_scores(predicted_scores),
        "nan_or_inf_count": nan_or_inf_count,
        "top1_factor_distributions": summarize_distribution(top_configs),
        "delivered_config_match_count": delivered_match_count,
        "guardrail_checked": True,
        "guardrail_filtered_total": guardrail_filtered_total,
        "guardrail_fallback_count": guardrail_fallback_count,
    }

    rendered = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
