#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any, Callable, Iterable, Mapping

ML_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_ROOT.parent
sys.path.insert(0, str(ML_ROOT / "src"))

from eduai_ml.data.dataset_validation import (  # noqa: E402
    OUTCOME_FIELD_NAMES,
    load_jsonl_dataset,
    validate_observation_record,
)
from eduai_ml.data.splits import split_overlap_diagnostics, split_records_by_strategy  # noqa: E402
from eduai_ml.factor_space import FACTOR_NAMES, generate_bounded_candidate_set  # noqa: E402
from eduai_ml.training.artifact_loader import load_candidate_scorer_artifact  # noqa: E402
from eduai_ml.training.baseline_policies import (  # noqa: E402
    candidate_key,
    heuristic_like_baseline,
    random_candidate_baseline,
    static_baseline_candidate,
)
from eduai_ml.training.feature_extraction import extract_features  # noqa: E402
from eduai_ml.training.target_builder import TargetUnavailableError, build_targets  # noqa: E402

PredictionFn = Callable[[Mapping[str, Any]], dict[str, float]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare EduAI scorer metrics against transparent baselines.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-ratio", type=float, default=0.7)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument(
        "--split-strategy",
        default="user_id_hash",
        choices=["observation_id_hash", "user_id_hash", "topic_id_hash", "time_ordered"],
    )
    parser.add_argument("--current-runtime-artifact", default="")
    return parser.parse_args()


def clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def average(values: Iterable[float]) -> float | None:
    materialized = list(values)
    if not materialized:
        return None
    return mean(materialized)


def round_or_none(value: float | None) -> float | None:
    if value is None or math.isnan(value):
        return None
    return round(value, 6)


def rmse(errors: list[float]) -> float | None:
    if not errors:
        return None
    return math.sqrt(mean(error * error for error in errors))


def r2_score(y_true: list[float], y_pred: list[float]) -> float | None:
    if not y_true:
        return None
    y_bar = mean(y_true)
    total = sum((value - y_bar) ** 2 for value in y_true)
    if total == 0:
        return None
    residual = sum((truth - prediction) ** 2 for truth, prediction in zip(y_true, y_pred, strict=True))
    return 1 - residual / total


def ranks(values: list[float]) -> list[float]:
    indexed = sorted(enumerate(values), key=lambda item: item[1])
    result = [0.0] * len(values)
    index = 0
    while index < len(indexed):
        next_index = index + 1
        while next_index < len(indexed) and indexed[next_index][1] == indexed[index][1]:
            next_index += 1
        average_rank = (index + 1 + next_index) / 2
        for original_index, _value in indexed[index:next_index]:
            result[original_index] = average_rank
        index = next_index
    return result


def pearson(x_values: list[float], y_values: list[float]) -> float | None:
    if len(x_values) < 2 or len(x_values) != len(y_values):
        return None
    x_mean = mean(x_values)
    y_mean = mean(y_values)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_values, y_values, strict=True))
    x_denominator = math.sqrt(sum((x - x_mean) ** 2 for x in x_values))
    y_denominator = math.sqrt(sum((y - y_mean) ** 2 for y in y_values))
    if x_denominator == 0 or y_denominator == 0:
        return None
    return numerator / (x_denominator * y_denominator)


def spearman(y_true: list[float], y_pred: list[float]) -> float | None:
    if len(y_true) < 2:
        return None
    return pearson(ranks(y_true), ranks(y_pred))


def roc_auc(y_true: list[float], y_score: list[float]) -> float | None:
    positive_count = sum(1 for value in y_true if value == 1.0)
    negative_count = sum(1 for value in y_true if value == 0.0)
    if positive_count == 0 or negative_count == 0:
        return None
    score_ranks = ranks(y_score)
    positive_rank_sum = sum(rank for rank, truth in zip(score_ranks, y_true, strict=True) if truth == 1.0)
    auc = (positive_rank_sum - positive_count * (positive_count + 1) / 2) / (positive_count * negative_count)
    return auc


def observation_id(record: Mapping[str, Any]) -> str:
    ids = record.get("ids", {})
    return str(ids.get("observation_id", "")) if isinstance(ids, Mapping) else ""


def config_key_from_record(record: Mapping[str, Any]) -> tuple[str, ...]:
    config = record.get("candidate_config", {})
    if not isinstance(config, Mapping):
        return tuple("" for _ in FACTOR_NAMES)
    return tuple(str(config.get(factor, "")) for factor in FACTOR_NAMES)


def mean_targets(records: Iterable[Mapping[str, Any]]) -> dict[str, float]:
    grouped: defaultdict[str, list[float]] = defaultdict(list)
    for record in records:
        try:
            targets = build_targets(record)
        except TargetUnavailableError:
            continue
        for name, value in targets.items():
            grouped[name].append(float(value))
    if not grouped:
        raise ValueError("Cannot build baseline without supervised train targets")
    return {name: mean(values) for name, values in grouped.items()}


def mean_targets_by_candidate(records: Iterable[Mapping[str, Any]]) -> dict[tuple[str, ...], dict[str, float]]:
    grouped: defaultdict[tuple[str, ...], list[dict[str, float]]] = defaultdict(list)
    for record in records:
        try:
            grouped[config_key_from_record(record)].append(build_targets(record))
        except TargetUnavailableError:
            continue
    result: dict[tuple[str, ...], dict[str, float]] = {}
    for key, targets in grouped.items():
        result[key] = {
            target_name: mean(float(row[target_name]) for row in targets)
            for target_name in ("expected_learning_gain_proxy", "expected_next_step_success", "combined_outcome_score")
        }
    return result


def random_probability(seed: int, record: Mapping[str, Any]) -> float:
    digest = hashlib.sha256(f"{seed}:{observation_id(record)}".encode("utf-8")).hexdigest()
    return int(digest[:12], 16) / float(0xFFFFFFFFFFFF)


def metrics_for_predictions(records: list[Mapping[str, Any]], predict: PredictionFn) -> dict[str, Any]:
    combined_truth: list[float] = []
    combined_pred: list[float] = []
    success_truth: list[float] = []
    success_prob: list[float] = []
    skipped = 0

    for record in records:
        try:
            target = build_targets(record)
            prediction = predict(record)
        except TargetUnavailableError:
            skipped += 1
            continue
        combined_truth.append(float(target["combined_outcome_score"]))
        combined_pred.append(clamp(float(prediction["combined_outcome_score"])))
        success_truth.append(float(target["expected_next_step_success"]))
        success_prob.append(clamp(float(prediction["expected_next_step_success"])))

    combined_errors = [prediction - truth for truth, prediction in zip(combined_truth, combined_pred, strict=True)]
    success_pred = [1 if probability >= 0.5 else 0 for probability in success_prob]
    tp = sum(1 for truth, prediction in zip(success_truth, success_pred, strict=True) if truth == 1.0 and prediction == 1)
    tn = sum(1 for truth, prediction in zip(success_truth, success_pred, strict=True) if truth == 0.0 and prediction == 0)
    fp = sum(1 for truth, prediction in zip(success_truth, success_pred, strict=True) if truth == 0.0 and prediction == 1)
    fn = sum(1 for truth, prediction in zip(success_truth, success_pred, strict=True) if truth == 1.0 and prediction == 0)
    total = len(success_truth)
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision is not None and recall is not None and precision + recall else None
    accuracy = (tp + tn) / total if total else None
    brier = mean((probability - truth) ** 2 for truth, probability in zip(success_truth, success_prob, strict=True)) if total else None

    return {
        "row_count": len(records),
        "usable_count": total,
        "skipped_count": skipped,
        "combined_outcome_score": {
            "mae": round_or_none(mean(abs(error) for error in combined_errors) if combined_errors else None),
            "rmse": round_or_none(rmse(combined_errors)),
            "r2": round_or_none(r2_score(combined_truth, combined_pred)),
            "spearman": round_or_none(spearman(combined_truth, combined_pred)),
        },
        "expected_next_step_success": {
            "accuracy": round_or_none(accuracy),
            "precision": round_or_none(precision),
            "recall": round_or_none(recall),
            "f1": round_or_none(f1),
            "roc_auc": round_or_none(roc_auc(success_truth, success_prob)),
            "brier": round_or_none(brier),
            "positive_count": sum(1 for value in success_truth if value == 1.0),
            "negative_count": sum(1 for value in success_truth if value == 0.0),
        },
    }


def build_comparison_table(metrics: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for model_name, split_metrics in metrics.items():
        for split_name, metric in split_metrics.items():
            combined = metric.get("combined_outcome_score", {})
            success = metric.get("expected_next_step_success", {})
            rows.append(
                {
                    "model": model_name,
                    "split": split_name,
                    "rows": metric.get("usable_count"),
                    "mae": combined.get("mae"),
                    "rmse": combined.get("rmse"),
                    "r2": combined.get("r2"),
                    "spearman": combined.get("spearman"),
                    "accuracy": success.get("accuracy"),
                    "precision": success.get("precision"),
                    "recall": success.get("recall"),
                    "f1": success.get("f1"),
                    "roc_auc": success.get("roc_auc"),
                    "brier": success.get("brier"),
                }
            )
    return rows


def user_counts(records_by_split: Mapping[str, list[Mapping[str, Any]]]) -> dict[str, dict[str, int]]:
    summary: dict[str, dict[str, int]] = {}
    for split, records in records_by_split.items():
        users = {
            str(record.get("ids", {}).get("user_ref", ""))
            for record in records
            if isinstance(record.get("ids"), Mapping)
        }
        summary[split] = {"rows": len(records), "users": len(users)}
    return summary


def policy_observed_comparison(
    records: list[Mapping[str, Any]],
    *,
    seed: int,
) -> dict[str, Any]:
    policies: dict[str, Callable[[Mapping[str, Any]], Mapping[str, str]]] = {
        "static_baseline": lambda _record: static_baseline_candidate(),
        "random_candidate_baseline": lambda record: random_candidate_baseline(seed, record),
        "heuristic_like_baseline": heuristic_like_baseline,
    }
    result: dict[str, Any] = {}
    for name, policy in policies.items():
        values: list[float] = []
        successes: list[float] = []
        for record in records:
            try:
                selected = policy(record)
                target = build_targets(record)
            except Exception:
                continue
            if candidate_key(selected) != candidate_key(record.get("candidate_config", {})):
                continue
            values.append(target["combined_outcome_score"])
            successes.append(target["expected_next_step_success"])
        result[name] = {
            "matching_rows": len(values),
            "mean_selected_true_score": round_or_none(mean(values) if values else None),
            "success_rate_on_matching_rows": round_or_none(mean(successes) if successes else None),
            "counterfactual_safe": False,
            "note": "Uses only rows where the policy-selected config matches the observed delivered candidate.",
        }
    return result


def model_selection_sanity(records: list[Mapping[str, Any]], predict: PredictionFn) -> dict[str, Any]:
    selected_configs: Counter[tuple[str, ...]] = Counter()
    matched_delivered = 0
    evaluated = 0
    for record in records:
        base_candidate = record.get("candidate_config")
        if not isinstance(base_candidate, Mapping):
            continue
        candidates = generate_bounded_candidate_set(base_candidate, max_candidates=12)
        scored: list[tuple[float, Mapping[str, str]]] = []
        for candidate in candidates:
            candidate_record = json.loads(json.dumps(record))
            candidate_record["candidate_config"] = candidate
            prediction = predict(candidate_record)
            scored.append((prediction["combined_outcome_score"], candidate))
        if not scored:
            continue
        scored.sort(key=lambda item: item[0], reverse=True)
        top_candidate = scored[0][1]
        selected_configs[candidate_key(top_candidate)] += 1
        if candidate_key(top_candidate) == candidate_key(record.get("candidate_config", {})):
            matched_delivered += 1
        evaluated += 1
    return {
        "evaluated_states": evaluated,
        "unique_top1_candidate_configs": len(selected_configs),
        "most_common_top1_configs": [
            {"config_key": list(key), "count": count}
            for key, count in selected_configs.most_common(10)
        ],
        "matched_delivered_top1_rows": matched_delivered,
        "always_same_config": len(selected_configs) <= 1 if evaluated else None,
    }


def prediction_ranges(records: list[Mapping[str, Any]], predict: PredictionFn) -> dict[str, Any]:
    values: defaultdict[str, list[float]] = defaultdict(list)
    for record in records:
        try:
            prediction = predict(record)
        except Exception:
            continue
        for name in ("expected_learning_gain_proxy", "expected_next_step_success", "combined_outcome_score"):
            values[name].append(float(prediction[name]))
    return {
        name: {
            "min": round_or_none(min(items) if items else None),
            "max": round_or_none(max(items) if items else None),
        }
        for name, items in values.items()
    }


def top_weights(artifact: Mapping[str, Any], target_name: str, limit: int = 20) -> list[dict[str, Any]]:
    payload = artifact["model"]["weights_or_serialized_payload"]
    feature_names = list(payload["feature_names"])
    weights = list(payload["weights"][target_name])
    pairs = [
        {"feature": feature, "weight": round(float(weight), 10), "abs_weight": abs(float(weight))}
        for feature, weight in zip(feature_names, weights[1:], strict=True)
    ]
    pairs.sort(key=lambda item: item["abs_weight"], reverse=True)
    return [
        {"feature": item["feature"], "weight": item["weight"]}
        for item in pairs[:limit]
    ]


def current_runtime_row(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    artifact = json.loads(path.read_text(encoding="utf-8"))
    selected = artifact.get("selectedModel", {})
    test = selected.get("test", {}) if isinstance(selected, Mapping) else {}
    return {
        "model": f"current_runtime_artifact:{selected.get('name', 'unknown')}",
        "split": "stored_test_not_same_dataset",
        "rows": test.get("samples"),
        "mae": None,
        "rmse": None,
        "r2": None,
        "spearman": None,
        "accuracy": round_or_none(float(test["accuracy"])) if "accuracy" in test else None,
        "precision": None,
        "recall": None,
        "f1": None,
        "roc_auc": round_or_none(float(test["rocAuc"])) if "rocAuc" in test else None,
        "brier": round_or_none(float(test["brierScore"])) if "brierScore" in test else None,
        "directly_comparable": False,
        "note": "Stored runtime artifact targets next-task success on an older synthetic bridge dataset; runtimeServingActive is false.",
    }


def main() -> int:
    args = parse_args()
    records = load_jsonl_dataset(args.input)
    for record in records:
        validate_observation_record(record)

    artifact, scorer = load_candidate_scorer_artifact(args.artifact)
    split_records = split_records_by_strategy(
        records,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        seed=args.seed,
        split_strategy=args.split_strategy,
    )
    split_records = {split: list(split_rows) for split, split_rows in split_records.items()}

    train_means = mean_targets(split_records["train"])
    candidate_means = mean_targets_by_candidate(split_records["train"])
    majority_success = 1.0 if train_means["expected_next_step_success"] >= 0.5 else 0.0

    def trained_model(record: Mapping[str, Any]) -> dict[str, float]:
        return scorer.score_observation(record)

    def constant_mean(record: Mapping[str, Any]) -> dict[str, float]:
        return dict(train_means)

    def candidate_cell_mean(record: Mapping[str, Any]) -> dict[str, float]:
        return dict(candidate_means.get(config_key_from_record(record), train_means))

    def majority_success_baseline(record: Mapping[str, Any]) -> dict[str, float]:
        return {
            "expected_learning_gain_proxy": train_means["expected_learning_gain_proxy"],
            "expected_next_step_success": majority_success,
            "combined_outcome_score": clamp(0.75 * train_means["expected_learning_gain_proxy"] + 0.25 * majority_success),
        }

    def random_success_baseline(record: Mapping[str, Any]) -> dict[str, float]:
        probability = random_probability(args.seed, record)
        return {
            "expected_learning_gain_proxy": train_means["expected_learning_gain_proxy"],
            "expected_next_step_success": probability,
            "combined_outcome_score": clamp(0.75 * train_means["expected_learning_gain_proxy"] + 0.25 * probability),
        }

    predictors: dict[str, PredictionFn] = {
        "trained_linear_candidate_scorer_v1": trained_model,
        "constant_mean_train_baseline": constant_mean,
        "candidate_cell_mean_train_baseline": candidate_cell_mean,
        "majority_success_train_baseline": majority_success_baseline,
        "random_success_seeded_baseline": random_success_baseline,
    }

    metrics = {
        name: {
            split: metrics_for_predictions(split_rows, predictor)
            for split, split_rows in split_records.items()
        }
        for name, predictor in predictors.items()
    }

    comparison_table = build_comparison_table(metrics)
    current_runtime_artifact_path = Path(args.current_runtime_artifact) if args.current_runtime_artifact else None
    current_row = current_runtime_row(current_runtime_artifact_path) if current_runtime_artifact_path else None
    if current_row is not None:
        comparison_table.append(current_row)

    feature_names = artifact["model"]["weights_or_serialized_payload"]["feature_names"]
    forbidden_feature_hits = sorted(set(feature_names) & (OUTCOME_FIELD_NAMES | {"user_ref", "ids.user_ref"}))
    extracted_feature_names = set(extract_features(records[0]).keys()) if records else set()
    extracted_forbidden_hits = sorted(extracted_feature_names & (OUTCOME_FIELD_NAMES | {"user_ref", "ids.user_ref"}))

    report = {
        "schema_version": "candidate_scorer_comparison.v1",
        "input": args.input,
        "artifact": args.artifact,
        "seed": args.seed,
        "split_strategy": args.split_strategy,
        "split_summary": user_counts(split_records),
        "split_diagnostics": split_overlap_diagnostics(split_records, split_strategy=args.split_strategy),
        "train_target_means": {name: round_or_none(value) for name, value in train_means.items()},
        "metrics": metrics,
        "comparison_table": comparison_table,
        "policy_observed_comparison": policy_observed_comparison(split_records["test"], seed=args.seed),
        "model_selection_sanity": model_selection_sanity(split_records["test"], trained_model),
        "prediction_ranges": prediction_ranges(split_records["test"], trained_model),
        "feature_weight_diagnostics": {
            "top_combined_score_weights": top_weights(artifact, "combined_outcome_score"),
            "top_success_logit_weights": top_weights(artifact, "expected_next_step_success_logit"),
        },
        "leakage_checks": {
            "artifact_feature_names_forbidden_hits": forbidden_feature_hits,
            "extracted_feature_names_forbidden_hits": extracted_forbidden_hits,
            "user_ref_used_as_feature": any("user_ref" in str(name) for name in feature_names),
            "outcome_fields_used_as_features": bool(forbidden_feature_hits or extracted_forbidden_hits),
        },
        "current_runtime_artifact": {
            "path": str(current_runtime_artifact_path) if current_runtime_artifact_path else None,
            "loaded": current_row is not None,
            "directly_comparable": False if current_row is not None else None,
        },
        "ranking_evaluation": {
            "counterfactual_labels_available": False,
            "top1_true_outcome_score": None,
            "regret_at_1": None,
            "mean_selected_true_score": None,
            "note": "The THU dataset contains observed delivered rows, not counterfactual outcomes for every candidate.",
        },
    }

    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    test_row = metrics["trained_linear_candidate_scorer_v1"]["test"]
    print(
        "OK "
        + json.dumps(
            {
                "test_combined_mae": test_row["combined_outcome_score"]["mae"],
                "test_combined_rmse": test_row["combined_outcome_score"]["rmse"],
                "test_success_accuracy": test_row["expected_next_step_success"]["accuracy"],
                "test_success_f1": test_row["expected_next_step_success"]["f1"],
                "split_strategy": args.split_strategy,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
