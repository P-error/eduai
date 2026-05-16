from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from eduai_ml.data.dataset_validation import summarize_observations
from eduai_ml.data.splits import DEFAULT_SPLIT_STRATEGY, split_records_by_strategy

from .artifact_writer import build_model_artifact
from .constant_scorer import ConstantCandidateScorer, train_constant_candidate_scorer
from .evaluator import evaluate_candidate_scorer
from .feature_extraction import extract_features
from .simple_scorer import SimpleCandidateScorer, train_simple_candidate_scorer
from .target_builder import DEFAULT_TARGET_SCHEMA_VERSION, TargetUnavailableError, build_targets
from .tree_scorer import TREE_MODEL_VARIANTS, TreeCandidateScorer, train_tree_candidate_scorer


@dataclass(frozen=True)
class TrainingResult:
    scorer: SimpleCandidateScorer | TreeCandidateScorer | ConstantCandidateScorer
    artifact: dict[str, Any]
    evaluation_report: dict[str, Any]
    skipped_rows: int


def train_candidate_scorer(
    records: list[Mapping[str, Any]],
    *,
    seed: int,
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
    test_ratio: float = 0.15,
    model_family: str = "linear_candidate_scorer_v1",
    model_variant: str | None = None,
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
    target_schema_version: str = DEFAULT_TARGET_SCHEMA_VERSION,
    include_policy_diagnostics: bool = True,
    build_artifact: bool = True,
) -> TrainingResult:
    supported_model_families = {
        "linear_candidate_scorer_v1",
        "tree_candidate_scorer_v1",
        "dummy_candidate_scorer_v1",
    }
    if model_family not in supported_model_families:
        raise ValueError(f"Unsupported model_family: {model_family}")
    if abs((train_ratio + validation_ratio + test_ratio) - 1.0) > 1e-9:
        raise ValueError("train_ratio + validation_ratio + test_ratio must equal 1")

    train_features: list[dict[str, float]] = []
    train_targets: list[dict[str, float]] = []
    skipped_rows = 0
    split_records = split_records_by_strategy(
        records,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        seed=seed,
        split_strategy=split_strategy,
    )
    train_record_ids = {
        str(record.get("ids", {}).get("observation_id", ""))
        for record in split_records["train"]
    }

    for record in records:
        try:
            targets = build_targets(record, target_schema_version=target_schema_version)
        except TargetUnavailableError:
            skipped_rows += 1
            continue
        observation_id = str(record.get("ids", {}).get("observation_id", ""))
        if observation_id not in train_record_ids:
            continue
        train_features.append(extract_features(record))
        train_targets.append(targets)

    if model_family == "linear_candidate_scorer_v1":
        scorer: SimpleCandidateScorer | TreeCandidateScorer | ConstantCandidateScorer = train_simple_candidate_scorer(
            train_features,
            train_targets,
        )
    elif model_family == "tree_candidate_scorer_v1":
        variant = model_variant or "extra_trees"
        if variant not in TREE_MODEL_VARIANTS:
            allowed = ", ".join(TREE_MODEL_VARIANTS)
            raise ValueError(f"Unsupported tree model variant: {variant}; allowed: {allowed}")
        scorer = train_tree_candidate_scorer(
            train_features,
            train_targets,
            variant=variant,
            seed=seed,
        )
    else:
        scorer = train_constant_candidate_scorer(
            train_targets,
            strategy=model_variant or "mean",
        )
    evaluation_report = evaluate_candidate_scorer(
        list(records),
        scorer,
        seed=seed,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        split_strategy=split_strategy,
        target_schema_version=target_schema_version,
        include_policy_diagnostics=include_policy_diagnostics,
    )
    model_version_suffix = model_family
    if model_variant:
        model_version_suffix = f"{model_version_suffix}_{model_variant}"
    artifact = {}
    if build_artifact:
        artifact = build_model_artifact(
            scorer=scorer,
            model_version=f"{model_version_suffix}_seed_{seed}",
            training_data_summary=summarize_observations(records),
            evaluation_report=evaluation_report,
            seed=seed,
            split_strategy=split_strategy,
            model_family=model_family,
            target_schema_version=target_schema_version,
            runtime_compatible=model_family == "linear_candidate_scorer_v1",
            limitations=[
                "Artifact is trained on synthetic THU observations; this is simulation validation, not proof on real learners.",
                (
                    "Learner-facing TypeScript runtime can read the existing linear scorer; "
                    "tree_candidate_scorer_v1 remains offline-trained unless a dedicated TS tree scorer is added."
                ),
                "Observed rows do not provide counterfactual outcomes for every possible candidate config.",
            ],
        )
    return TrainingResult(
        scorer=scorer,
        artifact=artifact,
        evaluation_report=evaluation_report,
        skipped_rows=skipped_rows,
    )
