from __future__ import annotations

import json
import math
from collections import Counter
from statistics import mean
from typing import Any, Callable, Mapping

from eduai_ml.data.dataset_validation import summarize_observations
from eduai_ml.data.splits import (
    DEFAULT_SPLIT_STRATEGY,
    normalize_split_strategy,
    split_overlap_diagnostics,
    split_records_by_strategy,
)
from eduai_ml.factor_space import generate_bounded_candidate_set
from eduai_ml.guardrails import (
    filter_unsafe_six_factor_candidates,
    is_intrinsically_risky_six_factor_candidate,
)

from .baseline_policies import (
    candidate_key,
    heuristic_like_baseline,
    oracle_upper_bound_for_synthetic,
    random_candidate_baseline,
    static_baseline_candidate,
)
from .class_balance import class_balance_diagnostics, metric_balance_warnings
from .feature_extraction import extract_features
from .target_builder import DEFAULT_TARGET_SCHEMA_VERSION, TargetUnavailableError, build_targets


def _rmse(errors: list[float]) -> float | None:
    if not errors:
        return None
    return round(math.sqrt(mean([error * error for error in errors])), 6)


def _mae(errors: list[float]) -> float | None:
    if not errors:
        return None
    return round(mean([abs(error) for error in errors]), 6)


def _log_loss(y_true: list[float], y_prob: list[float]) -> float | None:
    if not y_true:
        return None
    eps = 1e-12
    total = 0.0
    for truth, probability in zip(y_true, y_prob, strict=True):
        probability = max(eps, min(1 - eps, probability))
        total += -(truth * math.log(probability) + (1 - truth) * math.log(1 - probability))
    return round(total / len(y_true), 6)


def _balanced_accuracy(y_true: list[float], y_pred: list[int]) -> float | None:
    positives = [pred for truth, pred in zip(y_true, y_pred, strict=True) if truth == 1.0]
    negatives = [pred for truth, pred in zip(y_true, y_pred, strict=True) if truth == 0.0]
    if not positives or not negatives:
        return None
    true_positive_rate = sum(1 for pred in positives if pred == 1) / len(positives)
    true_negative_rate = sum(1 for pred in negatives if pred == 0) / len(negatives)
    return round((true_positive_rate + true_negative_rate) / 2, 6)


def compute_metrics(
    records: list[Mapping[str, Any]],
    scorer: Any,
    *,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
) -> dict[str, Any]:
    gain_errors: list[float] = []
    signed_gain_errors: list[float] = []
    combined_errors: list[float] = []
    success_truth: list[float] = []
    success_probabilities: list[float] = []
    success_predictions: list[int] = []
    skipped = 0

    for record in records:
        try:
            target = build_targets(record, target_schema_version=target_schema_version)
            prediction = scorer.score_observation(record)
        except TargetUnavailableError:
            skipped += 1
            continue

        gain_errors.append(prediction["expected_learning_gain_proxy"] - target["expected_learning_gain_proxy"])
        if "expected_learning_gain_signed" in target and "expected_learning_gain_signed" in prediction:
            signed_gain_errors.append(
                prediction["expected_learning_gain_signed"] - target["expected_learning_gain_signed"]
            )
        combined_errors.append(prediction["combined_outcome_score"] - target["combined_outcome_score"])
        success_truth.append(target["expected_next_step_success"])
        probability = prediction["expected_next_step_success"]
        success_probabilities.append(probability)
        success_predictions.append(1 if probability >= 0.5 else 0)

    accuracy = None
    if success_truth:
        accuracy = round(
            sum(
                1
                for truth, prediction in zip(success_truth, success_predictions, strict=True)
                if int(truth) == prediction
            )
            / len(success_truth),
            6,
        )
    positive_count = sum(1 for value in success_truth if value == 1.0)
    negative_count = sum(1 for value in success_truth if value == 0.0)
    positive_rate = positive_count / len(success_truth) if success_truth else None
    majority_class_accuracy = (
        max(positive_count, negative_count) / len(success_truth) if success_truth else None
    )
    balanced_accuracy = _balanced_accuracy(success_truth, success_predictions)

    return {
        "row_count": len(records),
        "usable_count": len(success_truth),
        "skipped_count": skipped,
        "expected_learning_gain_proxy": {
            "mae": _mae(gain_errors),
            "rmse": _rmse(gain_errors),
            "target_note": "legacy clamped gain target in 0..1",
        },
        "expected_learning_gain_signed": {
            "mae": _mae(signed_gain_errors),
            "rmse": _rmse(signed_gain_errors),
            "target_note": "signed learning gain target in -1..1; null means scorer did not emit signed target",
        },
        "expected_next_step_success": {
            "accuracy": accuracy,
            "balanced_accuracy": balanced_accuracy,
            "log_loss": _log_loss(success_truth, success_probabilities),
            "majority_class_accuracy": (
                round(majority_class_accuracy, 6) if majority_class_accuracy is not None else None
            ),
            "positive_rate": round(positive_rate, 6) if positive_rate is not None else None,
            "warnings": metric_balance_warnings(
                accuracy=accuracy,
                balanced_accuracy=balanced_accuracy,
                positive_rate=positive_rate,
            ),
        },
        "combined_outcome_score": {
            "mae": _mae(combined_errors),
            "rmse": _rmse(combined_errors),
        },
    }


def _matching_observed_outcome(
    records: list[Mapping[str, Any]],
    policy: Callable[[Mapping[str, Any]], dict[str, str]],
    *,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
) -> dict[str, Any]:
    values: list[float] = []
    gain_values: list[float] = []
    success_values: list[float] = []
    for record in records:
        try:
            candidate = policy(record)
            target = build_targets(record, target_schema_version=target_schema_version)
        except Exception:
            continue
        if candidate_key(candidate) != candidate_key(record.get("candidate_config", {})):
            continue
        values.append(target["combined_outcome_score"])
        gain_values.append(target["expected_learning_gain_proxy"])
        success_values.append(target["expected_next_step_success"])
    return {
        "matching_rows": len(values),
        "average_combined_outcome_score": round(mean(values), 6) if values else None,
        "average_learning_gain_proxy": round(mean(gain_values), 6) if gain_values else None,
        "next_step_success_rate": round(mean(success_values), 6) if success_values else None,
        "interpretation": "Observed delivered-row diagnostic only; not causal superiority.",
    }


def build_baseline_comparison(
    records: list[Mapping[str, Any]],
    *,
    seed: int,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
) -> dict[str, Any]:
    return {
        "static_baseline": _matching_observed_outcome(
            records,
            lambda _record: static_baseline_candidate(),
            target_schema_version=target_schema_version,
        ),
        "random_candidate_baseline": _matching_observed_outcome(
            records,
            lambda record: random_candidate_baseline(seed, record),
            target_schema_version=target_schema_version,
        ),
        "heuristic_like_baseline": _matching_observed_outcome(
            records,
            heuristic_like_baseline,
            target_schema_version=target_schema_version,
        ),
        "oracle_upper_bound_for_synthetic": oracle_upper_bound_for_synthetic(records),
        "limitations": [
            "Baseline comparison uses only rows whose delivered candidate matches the baseline candidate.",
            "No counterfactual outcomes are available for unserved candidates in this dataset.",
        ],
    }


def build_candidate_ranking_diagnostics(
    records: list[Mapping[str, Any]],
    scorer: Any,
    *,
    limit: int = 5,
    max_candidates: int = 12,
) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    for record in records:
        if len(examples) >= limit:
            break
        base_candidate = record.get("candidate_config")
        if not isinstance(base_candidate, Mapping):
            continue
        candidates = generate_bounded_candidate_set(base_candidate, max_candidates=max_candidates)
        scored: list[dict[str, Any]] = []
        for candidate in candidates:
            candidate_record = json.loads(json.dumps(record))
            candidate_record["candidate_config"] = candidate
            prediction = scorer.score_observation(candidate_record)
            scored.append({"candidate_config": candidate, "prediction": prediction})
        scored.sort(key=lambda item: item["prediction"]["combined_outcome_score"], reverse=True)
        examples.append(
            {
                "observation_id": record.get("ids", {}).get("observation_id"),
                "base_candidate_config": dict(base_candidate),
                "top_candidates": scored[: min(3, len(scored))],
                "diagnostic_only": True,
            }
        )
    return examples


def _factor_distribution_for_candidates(
    candidates: list[Mapping[str, Any]],
) -> dict[str, dict[str, int]]:
    from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES

    distribution = {
        factor: {value: 0 for value in FACTOR_VALUES[factor]} for factor in FACTOR_NAMES
    }
    for candidate in candidates:
        for factor in FACTOR_NAMES:
            value = candidate.get(factor)
            if value in distribution[factor]:
                distribution[factor][str(value)] += 1
    return distribution


def _risky_combo_counts(candidates: list[Mapping[str, Any]]) -> dict[str, int]:
    return {
        "hard": sum(1 for candidate in candidates if candidate.get("difficulty") == "hard"),
        "brief": sum(1 for candidate in candidates if candidate.get("depth") == "brief"),
        "minimal": sum(1 for candidate in candidates if candidate.get("support_level") == "minimal"),
        "none": sum(1 for candidate in candidates if candidate.get("examples_level") == "none"),
        "technical": sum(1 for candidate in candidates if candidate.get("terminology_level") == "technical"),
        "hard_brief_minimal": sum(
            1
            for candidate in candidates
            if candidate.get("difficulty") == "hard"
            and candidate.get("depth") == "brief"
            and candidate.get("support_level") == "minimal"
        ),
        "hard_brief_minimal_none_technical": sum(
            1
            for candidate in candidates
            if candidate.get("difficulty") == "hard"
            and candidate.get("depth") == "brief"
            and candidate.get("support_level") == "minimal"
            and candidate.get("examples_level") == "none"
            and candidate.get("terminology_level") == "technical"
        ),
    }


def build_policy_selection_risk_diagnostics(
    records: list[Mapping[str, Any]],
    scorer: Any,
    *,
    max_candidates: int = 12,
) -> dict[str, Any]:
    raw_top_candidates: list[Mapping[str, Any]] = []
    guarded_top_candidates: list[Mapping[str, Any]] = []
    top_scores: list[float] = []
    score_margins: list[float] = []
    unsafe_candidate_count = 0
    total_candidate_count = 0
    guardrail_fallback_count = 0

    for record in records:
        base_candidate = record.get("candidate_config")
        pre_decision_features = record.get("pre_decision_features")
        if not isinstance(base_candidate, Mapping) or not isinstance(pre_decision_features, Mapping):
            continue
        candidates = generate_bounded_candidate_set(base_candidate, max_candidates=max_candidates)
        total_candidate_count += len(candidates)
        guardrail_result = filter_unsafe_six_factor_candidates(
            pre_decision_features,
            candidates,
        )
        unsafe_candidate_count += guardrail_result.filtered_count
        if guardrail_result.fallback_used:
            guardrail_fallback_count += 1

        scored: list[dict[str, Any]] = []
        for candidate in candidates:
            candidate_record = json.loads(json.dumps(record))
            candidate_record["candidate_config"] = candidate
            prediction = scorer.score_observation(candidate_record)
            scored.append({"candidate_config": candidate, "prediction": prediction})
        scored.sort(key=lambda item: item["prediction"]["combined_outcome_score"], reverse=True)
        if scored:
            raw_top_candidates.append(scored[0]["candidate_config"])
            top_scores.append(float(scored[0]["prediction"]["combined_outcome_score"]))
            if len(scored) > 1:
                score_margins.append(
                    float(scored[0]["prediction"]["combined_outcome_score"])
                    - float(scored[1]["prediction"]["combined_outcome_score"])
                )

        guarded_scored: list[dict[str, Any]] = [
            item
            for item in scored
            if item["candidate_config"] in guardrail_result.candidates
        ]
        if not guarded_scored and guardrail_result.candidates:
            fallback_candidate = guardrail_result.candidates[0]
            candidate_record = json.loads(json.dumps(record))
            candidate_record["candidate_config"] = fallback_candidate
            guarded_scored = [
                {
                    "candidate_config": fallback_candidate,
                    "prediction": scorer.score_observation(candidate_record),
                }
            ]
        if guarded_scored:
            guarded_top_candidates.append(guarded_scored[0]["candidate_config"])

    raw_count = len(raw_top_candidates)
    guarded_count = len(guarded_top_candidates)

    return {
        "evaluated_states": raw_count,
        "candidate_pool": {
            "total_candidate_count": total_candidate_count,
            "unsafe_candidate_count": unsafe_candidate_count,
            "unsafe_candidate_share": (
                round(unsafe_candidate_count / total_candidate_count, 6)
                if total_candidate_count
                else None
            ),
            "guardrail_fallback_count": guardrail_fallback_count,
        },
        "raw_top1": {
            "risky_config_share": (
                round(
                    sum(1 for candidate in raw_top_candidates if is_intrinsically_risky_six_factor_candidate(candidate))
                    / raw_count,
                    6,
                )
                if raw_count
                else None
            ),
            "high_risk_factor_frequency": _risky_combo_counts(raw_top_candidates),
            "factor_distribution": _factor_distribution_for_candidates(raw_top_candidates),
        },
        "guarded_top1": {
            "risky_config_share": (
                round(
                    sum(1 for candidate in guarded_top_candidates if is_intrinsically_risky_six_factor_candidate(candidate))
                    / guarded_count,
                    6,
                )
                if guarded_count
                else None
            ),
            "high_risk_factor_frequency": _risky_combo_counts(guarded_top_candidates),
            "factor_distribution": _factor_distribution_for_candidates(guarded_top_candidates),
        },
        "top_candidate_score_diagnostics": {
            "average_top1_combined_score": round(mean(top_scores), 6) if top_scores else None,
            "average_top1_top2_margin": round(mean(score_margins), 6) if score_margins else None,
            "low_margin_count_lt_0_01": sum(1 for value in score_margins if value < 0.01),
        },
        "counterfactual_metrics": {
            "available": False,
            "top1_regret": None,
            "top3_contains_best": None,
            "rank_correlation": None,
            "note": "Use evaluate_candidate_ranker.py with counterfactual candidate sets when available.",
        },
    }


def evaluate_candidate_scorer(
    records: list[Mapping[str, Any]],
    scorer: Any,
    *,
    seed: int = 42,
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
    include_policy_diagnostics: bool = True,
) -> dict[str, Any]:
    normalized_split_strategy = normalize_split_strategy(split_strategy)
    split_records = split_records_by_strategy(
        records,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        seed=seed,
        split_strategy=normalized_split_strategy,
    )
    skipped_unusable = 0
    for record in records:
        try:
            build_targets(record, target_schema_version=target_schema_version)
        except TargetUnavailableError:
            skipped_unusable += 1

    metrics = {
        split: compute_metrics(
            list(split_rows),
            scorer,
            target_schema_version=target_schema_version,
        )
        for split, split_rows in split_records.items()
    }
    class_balance = {
        "all": class_balance_diagnostics(list(records)),
        **{
            split: class_balance_diagnostics(list(split_rows))
            for split, split_rows in split_records.items()
        },
    }
    test_records = list(split_records["test"])
    policy_selection_risk_diagnostics = (
        build_policy_selection_risk_diagnostics(
            test_records,
            scorer,
        )
        if include_policy_diagnostics
        else {
            "available": False,
            "reason": "Skipped for fast model comparison; run detailed evaluation for selected model.",
        }
    )
    diagnostic_examples = (
        build_candidate_ranking_diagnostics(test_records, scorer)
        if include_policy_diagnostics
        else []
    )

    return {
        "dataset_summary": summarize_observations(records),
        "split_strategy": normalized_split_strategy,
        "target_schema_version": target_schema_version,
        "split_sizes": {split: len(split_rows) for split, split_rows in split_records.items()},
        "split_diagnostics": split_overlap_diagnostics(
            split_records,
            split_strategy=normalized_split_strategy,
        ),
        "skipped_rows": {"supervised_unusable_count": skipped_unusable},
        "model_metrics": metrics,
        "class_balance": class_balance,
        "baseline_comparison": build_baseline_comparison(
            test_records,
            seed=seed,
            target_schema_version=target_schema_version,
        ),
        "policy_selection_risk_diagnostics": policy_selection_risk_diagnostics,
        "limitations": [
            "Model quality depends on user-provided outcome-linked observations.",
            "Candidate ranking diagnostics do not prove real-world educational superiority.",
            "No counterfactual labels are available for all candidates.",
        ],
        "diagnostic_examples": diagnostic_examples,
    }


def summarize_splits(
    records: list[Mapping[str, Any]],
    *,
    seed: int,
    train_ratio: float,
    validation_ratio: float,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
) -> Counter[str]:
    counts: Counter[str] = Counter()
    for split, split_rows in split_records_by_strategy(
        records,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        seed=seed,
        split_strategy=split_strategy,
    ).items():
        counts[split] += len(split_rows)
    return counts
