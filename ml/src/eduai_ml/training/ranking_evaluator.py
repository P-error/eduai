from __future__ import annotations

import copy
import json
from pathlib import Path
from statistics import mean, median
from typing import Any, Mapping

from eduai_ml.data.synthetic_counterfactual import counterfactual_summary, load_counterfactual_jsonl
from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_VALUES
from eduai_ml.guardrails import filter_unsafe_six_factor_candidates, is_intrinsically_risky_six_factor_candidate

from .artifact_loader import load_candidate_scorer_artifact
from .baseline_policies import (
    candidate_key,
    heuristic_like_baseline,
    random_candidate_baseline,
    static_baseline_candidate,
)
from .simple_scorer import SimpleCandidateScorer


def _state_observation_for_candidate(state: Mapping[str, Any], candidate_config: Mapping[str, str]) -> dict[str, Any]:
    return {
        "ids": {
            "observation_id": state["state_id"],
            "user_ref": state["ids"]["user_ref"],
            "subject_ref": state["ids"]["subject_ref"],
            "topic_ref": state["ids"]["topic_ref"],
            "session_ref": state["ids"].get("session_ref"),
        },
        "source": {
            "source_kind": "synthetic",
            "source_name": state["source"]["source_name"],
            "source_version": state["source"]["source_version"],
        },
        "pre_decision_features": copy.deepcopy(state["pre_decision_features"]),
        "candidate_config": dict(candidate_config),
    }


def _spearman(predicted_scores: list[float], true_scores: list[float]) -> float | None:
    n = len(predicted_scores)
    if n < 2:
        return None
    predicted_order = sorted(range(n), key=lambda index: predicted_scores[index], reverse=True)
    true_order = sorted(range(n), key=lambda index: true_scores[index], reverse=True)
    predicted_rank = {item_index: rank for rank, item_index in enumerate(predicted_order, start=1)}
    true_rank = {item_index: rank for rank, item_index in enumerate(true_order, start=1)}
    diff_squared = sum(
        (predicted_rank[index] - true_rank[index]) ** 2
        for index in range(n)
    )
    return round(1 - (6 * diff_squared) / (n * ((n * n) - 1)), 6)


def _candidate_true_score_map(state: Mapping[str, Any]) -> dict[tuple[str, ...], float]:
    return {
        candidate_key(item["candidate_config"]): float(item["synthetic_outcome"]["combined_outcome_score"])
        for item in state["candidate_set"]
    }


def _baseline_score(
    state: Mapping[str, Any],
    score_map: Mapping[tuple[str, ...], float],
    candidate: Mapping[str, str],
) -> float | None:
    return score_map.get(candidate_key(candidate))


def _factor_distribution(candidates: list[Mapping[str, Any]]) -> dict[str, dict[str, int]]:
    distribution = {
        factor: {value: 0 for value in FACTOR_VALUES[factor]} for factor in FACTOR_NAMES
    }
    for candidate in candidates:
        for factor in FACTOR_NAMES:
            value = candidate.get(factor)
            if value in distribution[factor]:
                distribution[factor][str(value)] += 1
    return distribution


def _risk_frequency(candidates: list[Mapping[str, Any]]) -> dict[str, int]:
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
    }


def evaluate_ranker_on_counterfactual_states(
    states: list[Mapping[str, Any]],
    scorer: SimpleCandidateScorer,
    *,
    seed: int = 42,
    diagnostic_limit: int = 5,
) -> dict[str, Any]:
    regrets: list[float] = []
    top1_matches = 0
    top3_contains_best = 0
    spearman_values: list[float] = []
    model_top1_true_scores: list[float] = []
    static_scores: list[float] = []
    heuristic_scores: list[float] = []
    random_scores: list[float] = []
    model_top1_candidates: list[Mapping[str, Any]] = []
    unsafe_candidate_count = 0
    total_candidate_count = 0
    guardrail_fallback_count = 0
    examples: list[dict[str, Any]] = []

    for state in states:
        scored_candidates: list[dict[str, Any]] = []
        true_scores: list[float] = []
        predicted_scores: list[float] = []
        for item in state["candidate_set"]:
            candidate_config = item["candidate_config"]
            score_observation = _state_observation_for_candidate(state, candidate_config)
            prediction = scorer.score_observation(score_observation)
            true_score = float(item["synthetic_outcome"]["combined_outcome_score"])
            scored_candidates.append(
                {
                    "candidate_config": candidate_config,
                    "prediction": prediction,
                    "true_combined_outcome_score": true_score,
                }
            )
            predicted_scores.append(float(prediction["combined_outcome_score"]))
            true_scores.append(true_score)
        total_candidate_count += len(state["candidate_set"])
        guardrail_result = filter_unsafe_six_factor_candidates(
            state["pre_decision_features"],
            [item["candidate_config"] for item in state["candidate_set"]],
        )
        unsafe_candidate_count += guardrail_result.filtered_count
        if guardrail_result.fallback_used:
            guardrail_fallback_count += 1

        scored_by_prediction = sorted(
            scored_candidates,
            key=lambda item: item["prediction"]["combined_outcome_score"],
            reverse=True,
        )
        scored_by_truth = sorted(
            scored_candidates,
            key=lambda item: item["true_combined_outcome_score"],
            reverse=True,
        )
        model_top1 = scored_by_prediction[0]
        model_top1_candidates.append(model_top1["candidate_config"])
        true_best = scored_by_truth[0]
        best_true_score = float(true_best["true_combined_outcome_score"])
        model_top1_true_score = float(model_top1["true_combined_outcome_score"])
        regret = round(best_true_score - model_top1_true_score, 6)
        regrets.append(regret)
        model_top1_true_scores.append(model_top1_true_score)
        if candidate_key(model_top1["candidate_config"]) == candidate_key(true_best["candidate_config"]):
            top1_matches += 1
        top3_keys = {candidate_key(item["candidate_config"]) for item in scored_by_prediction[:3]}
        if candidate_key(true_best["candidate_config"]) in top3_keys:
            top3_contains_best += 1
        spearman = _spearman(predicted_scores, true_scores)
        if spearman is not None:
            spearman_values.append(spearman)

        score_map = _candidate_true_score_map(state)
        static_score = _baseline_score(state, score_map, static_baseline_candidate())
        heuristic_score = _baseline_score(
            state,
            score_map,
            heuristic_like_baseline(_state_observation_for_candidate(state, model_top1["candidate_config"])),
        )
        random_score = _baseline_score(
            state,
            score_map,
            random_candidate_baseline(seed, _state_observation_for_candidate(state, model_top1["candidate_config"])),
        )
        if static_score is not None:
            static_scores.append(static_score)
        if heuristic_score is not None:
            heuristic_scores.append(heuristic_score)
        if random_score is not None:
            random_scores.append(random_score)

        if len(examples) < diagnostic_limit:
            examples.append(
                {
                    "state_id": state["state_id"],
                    "model_top1_candidate": model_top1,
                    "true_best_candidate": true_best,
                    "regret": regret,
                    "top3_candidates": scored_by_prediction[:3],
                }
            )

    state_count = len(states)
    average_model_top1 = mean(model_top1_true_scores) if model_top1_true_scores else None
    average_static = mean(static_scores) if static_scores else None
    average_heuristic = mean(heuristic_scores) if heuristic_scores else None

    ranking_metrics = {
        "state_count": state_count,
        "mean_top1_regret": round(mean(regrets), 6) if regrets else None,
        "median_top1_regret": round(median(regrets), 6) if regrets else None,
        "top1_match_rate": round(top1_matches / state_count, 6) if state_count else None,
        "top3_contains_best_rate": round(top3_contains_best / state_count, 6) if state_count else None,
        "spearman_rank_correlation": round(mean(spearman_values), 6) if spearman_values else None,
        "average_true_score_of_model_top1": round(average_model_top1, 6) if average_model_top1 is not None else None,
        "average_true_score_of_static_baseline": round(average_static, 6) if average_static is not None else None,
        "average_true_score_of_heuristic_baseline": round(average_heuristic, 6) if average_heuristic is not None else None,
        "average_true_score_of_random_baseline": round(mean(random_scores), 6) if random_scores else None,
        "improvement_over_static": (
            round(average_model_top1 - average_static, 6)
            if average_model_top1 is not None and average_static is not None
            else None
        ),
        "improvement_over_heuristic": (
            round(average_model_top1 - average_heuristic, 6)
            if average_model_top1 is not None and average_heuristic is not None
            else None
        ),
    }
    top1_count = len(model_top1_candidates)

    return {
        "dataset_summary": counterfactual_summary(states),
        "candidate_set_size_summary": counterfactual_summary(states)["candidate_set_size"],
        "ranking_metrics": ranking_metrics,
        "policy_selection_risk_diagnostics": {
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
            "model_top1": {
                "risky_config_share": (
                    round(
                        sum(
                            1
                            for candidate in model_top1_candidates
                            if is_intrinsically_risky_six_factor_candidate(candidate)
                        )
                        / top1_count,
                        6,
                    )
                    if top1_count
                    else None
                ),
                "high_risk_factor_frequency": _risk_frequency(model_top1_candidates),
                "factor_distribution": _factor_distribution(model_top1_candidates),
            },
        },
        "baseline_comparison": {
            "static_baseline_observed_states": len(static_scores),
            "heuristic_baseline_observed_states": len(heuristic_scores),
            "random_baseline_observed_states": len(random_scores),
            "interpretation": "Synthetic counterfactual diagnostic only; not real-world causal evidence.",
        },
        "class_balance_notes": {
            "candidate_outcome_positive_rate": counterfactual_summary(states)["candidate_outcome_positive_rate"],
        },
        "limitations": [
            "Synthetic ranking quality is not proof of real educational effect.",
            "diagnostic_truth and synthetic_outcome labels are never used as training features.",
            "Counterfactual labels come from the synthetic outcome function only.",
        ],
        "diagnostic_examples": examples,
    }


def evaluate_ranker_from_files(
    *,
    artifact_path: str | Path,
    counterfactual_input_path: str | Path,
    eval_out_path: str | Path,
    seed: int = 42,
) -> dict[str, Any]:
    _artifact, scorer = load_candidate_scorer_artifact(artifact_path)
    states = load_counterfactual_jsonl(counterfactual_input_path)
    report = evaluate_ranker_on_counterfactual_states(states, scorer, seed=seed)
    output_path = Path(eval_out_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report
