from __future__ import annotations

import hashlib
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

from eduai_ml.factor_space import (
    EXPLORATION_CONFIGS,
    FACTOR_NAMES,
    FACTOR_VALUES,
    generate_bounded_candidate_set,
    normalize_factor_config,
)
from eduai_ml.training.baseline_policies import (
    heuristic_like_baseline,
    random_candidate_baseline,
    static_baseline_candidate,
)
from eduai_ml.training.target_builder import build_targets

from .synthetic import (
    _build_pre_decision_features,
    _choose_candidate,
    _make_profile,
    _pick,
    compute_synthetic_outcome,
    compute_synthetic_pre_score,
)


def _candidate_key(config: Mapping[str, str]) -> tuple[str, ...]:
    return tuple(config[factor] for factor in FACTOR_NAMES)


def _candidate_rng(seed: int, state_id: str, candidate_config: Mapping[str, str]) -> random.Random:
    raw = f"{seed}:{state_id}:{'|'.join(_candidate_key(candidate_config))}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return random.Random(int(digest[:16], 16))


def _combined_outcome_score(outcome: Mapping[str, Any]) -> float:
    gain = float(outcome["normalized_learning_gain"])
    success = 1.0 if bool(outcome["next_step_success"]) else 0.0
    return round((0.75 * gain) + (0.25 * success), 4)


def _append_unique(
    candidates: list[dict[str, str]],
    seen: set[tuple[str, ...]],
    candidate: Mapping[str, Any],
    max_candidates: int,
) -> None:
    if len(candidates) >= max_candidates:
        return
    normalized = normalize_factor_config(candidate)
    key = _candidate_key(normalized)
    if key in seen:
        return
    seen.add(key)
    candidates.append(normalized)


def build_counterfactual_candidate_set(
    *,
    state_observation: Mapping[str, Any],
    delivered_candidate: Mapping[str, Any],
    seed: int,
    max_candidates: int,
) -> list[dict[str, str]]:
    if max_candidates < 4:
        raise ValueError("max_candidates must be at least 4")

    candidates: list[dict[str, str]] = []
    seen: set[tuple[str, ...]] = set()
    _append_unique(candidates, seen, delivered_candidate, max_candidates)
    _append_unique(candidates, seen, static_baseline_candidate(), max_candidates)
    _append_unique(candidates, seen, heuristic_like_baseline(state_observation), max_candidates)
    _append_unique(candidates, seen, random_candidate_baseline(seed, state_observation), max_candidates)

    for candidate in generate_bounded_candidate_set(delivered_candidate, max_candidates=max_candidates):
        _append_unique(candidates, seen, candidate, max_candidates)
    for candidate in EXPLORATION_CONFIGS:
        _append_unique(candidates, seen, candidate, max_candidates)

    return candidates


def generate_synthetic_counterfactual_states(
    *,
    n_learners: int,
    n_topics: int,
    states_per_learner: int,
    max_candidates: int,
    seed: int,
) -> list[dict[str, Any]]:
    if n_learners < 1:
        raise ValueError("n_learners must be positive")
    if n_topics < 1:
        raise ValueError("n_topics must be positive")
    if states_per_learner < 1:
        raise ValueError("states_per_learner must be positive")
    if max_candidates < 4:
        raise ValueError("max_candidates must be at least 4")

    rng = random.Random(seed)
    profiles = [_make_profile(rng) for _ in range(n_learners)]
    histories: list[list[bool]] = [[] for _ in range(n_learners)]
    topic_seen: list[dict[int, int]] = [dict() for _ in range(n_learners)]
    base_time = datetime(2026, 2, 1, 9, 0, tzinfo=timezone.utc)
    states: list[dict[str, Any]] = []

    for learner_index, profile in enumerate(profiles):
        for local_index in range(states_per_learner):
            global_index = learner_index * states_per_learner + local_index
            topic_index = (local_index + learner_index + rng.randrange(n_topics)) % n_topics
            topic_seen_count = topic_seen[learner_index].get(topic_index, 0)
            session_position = local_index % 12
            decision_time = base_time + timedelta(minutes=global_index * 19)
            state_id = f"cf_s{seed}_l{learner_index + 1:04d}_d{local_index + 1:04d}"
            user_ref = f"synthetic_learner_{learner_index + 1:04d}"

            pre_decision_features = _build_pre_decision_features(
                profile,
                histories[learner_index],
                topic_seen_count,
                session_position,
                rng,
            )
            delivered_candidate = _choose_candidate(profile, global_index, rng, "bounded")
            state_observation = {
                "ids": {
                    "observation_id": state_id,
                    "user_ref": user_ref,
                    "subject_ref": "synthetic_subject_general",
                    "topic_ref": f"synthetic_topic_{topic_index + 1:04d}",
                    "session_ref": f"synthetic_session_{learner_index + 1:04d}_{(local_index // 10) + 1:03d}",
                },
                "source": {
                    "source_kind": "synthetic",
                    "source_name": "eduai_synthetic_counterfactual_v1",
                    "source_version": "v1",
                },
                "pre_decision_features": pre_decision_features,
                "candidate_config": delivered_candidate,
            }
            candidates = build_counterfactual_candidate_set(
                state_observation=state_observation,
                delivered_candidate=delivered_candidate,
                seed=seed,
                max_candidates=max_candidates,
            )
            pre_score = compute_synthetic_pre_score(profile, pre_decision_features, rng)
            candidate_set: list[dict[str, Any]] = []
            for candidate in candidates:
                outcome_rng = _candidate_rng(seed, state_id, candidate)
                outcome = compute_synthetic_outcome(
                    profile,
                    pre_decision_features,
                    candidate,
                    outcome_rng,
                    pre_score_override=pre_score,
                )
                candidate_set.append(
                    {
                        "candidate_config": candidate,
                        "synthetic_outcome": {
                            **outcome,
                            "combined_outcome_score": _combined_outcome_score(outcome),
                        },
                    }
                )

            delivered_outcome = next(
                item["synthetic_outcome"]
                for item in candidate_set
                if _candidate_key(item["candidate_config"]) == _candidate_key(delivered_candidate)
            )
            histories[learner_index].append(bool(delivered_outcome["next_step_success"]))
            topic_seen[learner_index][topic_index] = topic_seen_count + 1

            states.append(
                {
                    "state_id": state_id,
                    "source": {
                        "source_kind": "synthetic",
                        "source_name": "eduai_synthetic_counterfactual_v1",
                        "source_version": "v1",
                    },
                    "ids": {
                        "user_ref": user_ref,
                        "subject_ref": "synthetic_subject_general",
                        "topic_ref": f"synthetic_topic_{topic_index + 1:04d}",
                        "session_ref": f"synthetic_session_{learner_index + 1:04d}_{(local_index // 10) + 1:03d}",
                    },
                    "timestamps": {
                        "decision_created_at": decision_time.isoformat().replace("+00:00", "Z"),
                    },
                    "pre_decision_features": pre_decision_features,
                    "candidate_set": candidate_set,
                    "diagnostic_truth": {
                        "available": True,
                        "not_for_training": True,
                        "notes": "Synthetic-only truth used for ranking evaluation, never for training features.",
                    },
                    "leakage_guard": {
                        "features_cutoff_at": decision_time.isoformat().replace("+00:00", "Z"),
                        "uses_only_pre_decision_data": True,
                        "notes": "candidate outcomes are synthetic counterfactual labels for evaluation only",
                    },
                }
            )

    return states


def write_counterfactual_jsonl(path: str | Path, states: list[Mapping[str, Any]]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        for state in states:
            file.write(json.dumps(dict(state), ensure_ascii=False, sort_keys=True) + "\n")


def load_counterfactual_jsonl(path: str | Path) -> list[dict[str, Any]]:
    states: list[dict[str, Any]] = []
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        state = json.loads(line)
        if not isinstance(state, dict):
            raise ValueError(f"Line {line_number}: expected JSON object")
        validate_counterfactual_state(state)
        states.append(state)
    return states


def validate_counterfactual_state(state: Mapping[str, Any]) -> None:
    if not state.get("state_id"):
        raise ValueError("counterfactual state requires state_id")
    candidate_set = state.get("candidate_set")
    if not isinstance(candidate_set, list) or not candidate_set:
        raise ValueError("counterfactual state requires non-empty candidate_set")
    if state.get("diagnostic_truth", {}).get("not_for_training") is not True:
        raise ValueError("diagnostic_truth.not_for_training must be true")
    if state.get("leakage_guard", {}).get("uses_only_pre_decision_data") is not True:
        raise ValueError("leakage_guard.uses_only_pre_decision_data must be true")

    base_observation = {
        "schema_version": "training_observation.v1",
        "ids": {
            "observation_id": state["state_id"],
            "user_ref": state["ids"]["user_ref"],
            "subject_ref": state["ids"]["subject_ref"],
            "topic_ref": state["ids"]["topic_ref"],
            "session_ref": state["ids"].get("session_ref"),
            "content_event_ref": None,
            "test_event_ref": "synthetic_counterfactual_label",
        },
        "timestamps": {
            "decision_created_at": state["timestamps"]["decision_created_at"],
            "outcome_observed_at": state["timestamps"]["decision_created_at"],
        },
        "source": {
            "source_kind": "synthetic",
            "source_name": state["source"]["source_name"],
            "source_version": state["source"]["source_version"],
            "adapter_version": None,
        },
        "pre_decision_features": state["pre_decision_features"],
        "candidate_config": candidate_set[0]["candidate_config"],
        "delivered_config": candidate_set[0]["candidate_config"],
        "outcome": candidate_set[0]["synthetic_outcome"],
        "leakage_guard": state["leakage_guard"],
        "policy_context": {
            "policy_id": "synthetic_counterfactual_eval_v1",
            "model_version": None,
            "backend_kind": "synthetic_generator",
            "fallback_used": False,
        },
    }
    build_targets(base_observation)
    for item in candidate_set:
        normalize_factor_config(item["candidate_config"])
        outcome = item.get("synthetic_outcome", {})
        for key in (
            "pre_score",
            "post_score",
            "max_score",
            "next_step_success",
            "normalized_learning_gain",
            "combined_outcome_score",
        ):
            if key not in outcome:
                raise ValueError(f"candidate synthetic_outcome missing {key}")


def counterfactual_summary(states: list[Mapping[str, Any]]) -> dict[str, Any]:
    sizes = [len(state["candidate_set"]) for state in states]
    positives = 0
    total = 0
    for state in states:
        for item in state["candidate_set"]:
            total += 1
            positives += 1 if item["synthetic_outcome"]["next_step_success"] else 0
    return {
        "state_count": len(states),
        "candidate_count": total,
        "candidate_set_size": {
            "min": min(sizes) if sizes else 0,
            "max": max(sizes) if sizes else 0,
            "average": round(sum(sizes) / len(sizes), 4) if sizes else 0,
        },
        "candidate_outcome_positive_rate": round(positives / total, 6) if total else None,
    }
