from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping

from eduai_ml.factor_space import normalize_factor_config
from eduai_ml.validation import validate_training_observation


def _default_policy_context(raw: Mapping[str, Any]) -> dict[str, Any]:
    policy_context = raw.get("policy_context")
    if isinstance(policy_context, Mapping):
        return {
            "policy_id": policy_context.get("policy_id"),
            "model_version": policy_context.get("model_version"),
            "backend_kind": policy_context.get("backend_kind"),
            "fallback_used": policy_context.get("fallback_used"),
        }
    return {
        "policy_id": None,
        "model_version": None,
        "backend_kind": None,
        "fallback_used": None,
    }


def normalize_real_user_observation(raw: Mapping[str, Any]) -> dict[str, Any]:
    if "candidate_config" not in raw:
        raise ValueError("real_user observation requires candidate_config")
    if "delivered_config" not in raw:
        raise ValueError("real_user observation requires delivered_config")
    if "leakage_guard" not in raw:
        raise ValueError("real_user observation requires leakage_guard")

    observation = deepcopy(dict(raw))
    observation["schema_version"] = "training_observation.v1"
    observation["candidate_config"] = normalize_factor_config(observation["candidate_config"])
    observation["delivered_config"] = normalize_factor_config(observation["delivered_config"])
    observation["policy_context"] = _default_policy_context(observation)

    source = dict(observation.get("source") or {})
    source["source_kind"] = "real_user"
    source.setdefault("source_name", "eduai")
    source.setdefault("source_version", "unknown")
    source.setdefault("adapter_version", "real_user_adapter.v1")
    observation["source"] = source

    validate_real_user_observation(observation)
    return observation


def validate_real_user_observation(obs: Mapping[str, Any]) -> None:
    if obs.get("source", {}).get("source_kind") != "real_user":
        raise ValueError("source.source_kind must be real_user")
    if "candidate_config" not in obs:
        raise ValueError("real_user observation requires candidate_config")
    if "delivered_config" not in obs:
        raise ValueError("real_user observation requires delivered_config")
    if "leakage_guard" not in obs:
        raise ValueError("real_user observation requires leakage_guard")

    outcome = obs.get("outcome", {})
    ids = obs.get("ids", {})
    leakage_guard = obs.get("leakage_guard", {})
    if outcome.get("outcome_available") is True and not ids.get("test_event_ref"):
        notes = leakage_guard.get("notes")
        if not isinstance(notes, str) or not notes.strip():
            raise ValueError(
                "real_user observation with outcome_available=true requires test_event_ref or leakage_guard.notes explanation"
            )

    validate_training_observation(dict(obs))
