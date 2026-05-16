from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from eduai_ml.factor_space import FACTOR_NAMES, FACTOR_SPACE_VERSION, FACTOR_VALUES
from eduai_ml.data.splits import DEFAULT_SPLIT_STRATEGY, normalize_split_strategy
from eduai_ml.validation import validate_model_artifact

from .feature_extraction import feature_schema
from .target_builder import DEFAULT_TARGET_SCHEMA_VERSION, target_schema


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_model_artifact(
    *,
    scorer: Any,
    model_version: str,
    training_data_summary: Mapping[str, Any],
    evaluation_report: Mapping[str, Any],
    seed: int,
    created_at: str | None = None,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
    model_family: str = "linear_candidate_scorer_v1",
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
    limitations: list[str] | None = None,
    runtime_compatible: bool = False,
) -> dict[str, Any]:
    source_kind_counts = training_data_summary.get("source_kind_counts", {})
    model_limitations = limitations or [
        "V1 artifact is trained only on synthetic observations.",
        "JSON weights are used instead of pickle for auditability and portability.",
        "The scorer predicts outcomes for candidate ranking diagnostics; it is not integrated into runtime.",
        "Synthetic fit does not prove real educational effectiveness.",
    ]
    artifact = {
        "artifact_kind": "eduai_native_pedagogy_artifact",
        "artifact_schema_version": "model_artifact.v1",
        "model_version": model_version,
        "created_at": created_at or _utc_now_iso(),
        "factor_space_version": FACTOR_SPACE_VERSION,
        "training_data": {
            "source_summary": json.dumps(source_kind_counts, sort_keys=True),
            "observation_count": int(training_data_summary.get("total_observations", 0)),
            "source_kinds": sorted(source_kind_counts.keys()) or ["synthetic"],
        },
        "training_data_summary": dict(training_data_summary),
        "target_definition": target_schema(target_schema_version),
        "feature_schema": feature_schema(),
        "candidate_schema": {
            "factor_space_version": FACTOR_SPACE_VERSION,
            "required_factors": list(FACTOR_NAMES),
            "factor_values": {factor: list(values) for factor, values in FACTOR_VALUES.items()},
        },
        "model": {
            "model_family": model_family,
            "parameters": {
                **dict(getattr(scorer, "parameters", {})),
                "seed": seed,
                "target_schema_version": target_schema_version,
            },
            "weights_or_serialized_payload": scorer.to_payload(),
        },
        "evaluation": {
            "split_strategy": str(evaluation_report.get("split_strategy") or normalize_split_strategy(split_strategy)),
            "metrics": evaluation_report.get("model_metrics", {}),
            "baseline_comparison": evaluation_report.get("baseline_comparison", {}),
            "model_comparison": evaluation_report.get("model_comparison", {}),
            "policy_selection_risk_diagnostics": evaluation_report.get("policy_selection_risk_diagnostics", {}),
        },
        "compatibility": {
            "app_min_version": None,
            "contract_version": "pedagogy_policy_contract_v1",
            "runtime_compatible": runtime_compatible,
        },
        "honesty_notes": [
            "Training/evaluation here is synthetic/simulation validation unless source_kind includes real_user.",
            "Learner-facing TypeScript runtime remains on the existing linear scorer unless a compatible runtime scorer is explicitly added and configured.",
        ],
        "limitations": model_limitations,
    }
    validate_model_artifact(artifact)
    return artifact


def write_model_artifact(path: str | Path, artifact: Mapping[str, Any]) -> None:
    validate_model_artifact(dict(artifact))
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(dict(artifact), ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
