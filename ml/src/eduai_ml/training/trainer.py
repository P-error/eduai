from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from eduai_ml.data.dataset_validation import summarize_observations
from eduai_ml.data.splits import DEFAULT_SPLIT_STRATEGY, split_records_by_strategy

from .artifact_writer import build_model_artifact
from .evaluator import evaluate_candidate_scorer
from .feature_extraction import extract_features
from .simple_scorer import SimpleCandidateScorer, train_simple_candidate_scorer
from .target_builder import TargetUnavailableError, build_targets


@dataclass(frozen=True)
class TrainingResult:
    scorer: SimpleCandidateScorer
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
    split_strategy: str = DEFAULT_SPLIT_STRATEGY,
) -> TrainingResult:
    if model_family != "linear_candidate_scorer_v1":
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
            targets = build_targets(record)
        except TargetUnavailableError:
            skipped_rows += 1
            continue
        observation_id = str(record.get("ids", {}).get("observation_id", ""))
        if observation_id not in train_record_ids:
            continue
        train_features.append(extract_features(record))
        train_targets.append(targets)

    scorer = train_simple_candidate_scorer(train_features, train_targets)
    evaluation_report = evaluate_candidate_scorer(
        list(records),
        scorer,
        seed=seed,
        train_ratio=train_ratio,
        validation_ratio=validation_ratio,
        split_strategy=split_strategy,
    )
    artifact = build_model_artifact(
        scorer=scorer,
        model_version=f"{model_family}_seed_{seed}",
        training_data_summary=summarize_observations(records),
        evaluation_report=evaluation_report,
        seed=seed,
        split_strategy=split_strategy,
    )
    return TrainingResult(
        scorer=scorer,
        artifact=artifact,
        evaluation_report=evaluation_report,
        skipped_rows=skipped_rows,
    )
