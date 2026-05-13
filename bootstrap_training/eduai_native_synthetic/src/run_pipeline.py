from __future__ import annotations

import argparse
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


WORKSPACE_SCHEMA_VERSION = "eduai_native_synthetic_training_workspace_v1_2026_03"
RUNTIME_ARTIFACT_KIND = "eduai_native_pedagogy_artifact"
RUNTIME_ARTIFACT_SCHEMA_VERSION = "eduai_native_pedagogy_artifact_v1_2026_03"
RUNTIME_SLOT_KIND = "eduai_native_pedagogy_artifact_slot"
RUNTIME_SLOT_SCHEMA_VERSION = "eduai_native_pedagogy_artifact_slot_v1_2026_03"
TARGET_SUCCESS_THRESHOLD = 2.0 / 3.0
TRAIN_RATIO = 0.7
VALIDATION_RATIO = 0.15
CALIBRATION_BINS = 8


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def save_text(path: Path, content: str) -> None:
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def resolve_workspace_root() -> Path:
    return Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the EduAI-native synthetic training, evaluation, and runtime-slot handoff pipeline."
    )
    parser.add_argument(
        "--snapshot-dir",
        default=None,
        help="Explicit synthetic snapshot directory under training_datasets/synthetic/<snapshot_id>.",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Optional explicit training run identifier.",
    )
    parser.add_argument(
        "--skip-runtime-handoff",
        action="store_true",
        help="Train and evaluate without packaging the winner into the runtime slot.",
    )
    return parser.parse_args()


def resolve_snapshot_dir(repo_root: Path, explicit: str | None) -> Path:
    if explicit:
        candidate = Path(explicit)
        if not candidate.is_absolute():
            candidate = repo_root / candidate
        return candidate

    synthetic_root = repo_root / "training_datasets" / "synthetic"
    candidates = sorted(path for path in synthetic_root.iterdir() if path.is_dir())
    if not candidates:
        raise FileNotFoundError("No synthetic training snapshot directories were found.")
    return candidates[-1]


def build_run_id(explicit: str | None) -> str:
    if explicit and explicit.strip():
        return explicit.strip()
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def calibration_summary(y_true: np.ndarray, y_prob: np.ndarray, bins: int) -> dict[str, Any]:
    edges = np.linspace(0.0, 1.0, bins + 1)
    assignments = np.digitize(y_prob, edges[1:-1], right=True)
    bucket_rows: list[dict[str, Any]] = []
    ece = 0.0
    total = len(y_true)

    for bucket in range(bins):
        mask = assignments == bucket
        count = int(mask.sum())
        if count == 0:
            continue
        avg_predicted = float(y_prob[mask].mean())
        avg_actual = float(y_true[mask].mean())
        gap = abs(avg_actual - avg_predicted)
        ece += gap * (count / total)
        bucket_rows.append(
            {
                "bucket": f"[{edges[bucket]:.2f}, {edges[bucket + 1]:.2f})",
                "count": count,
                "avgPredicted": avg_predicted,
                "avgActual": avg_actual,
                "absoluteGap": gap,
            }
        )

    return {
        "expectedCalibrationError": float(ece),
        "bins": bucket_rows,
    }


def score_predictions(y_true: np.ndarray, y_prob: np.ndarray) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "samples": int(len(y_true)),
        "positiveRate": float(y_true.mean()),
        "predictedPositiveRateAt0.5": float(np.mean(y_prob >= 0.5)),
        "accuracy": float(accuracy_score(y_true, y_prob >= 0.5)),
        "logLoss": float(log_loss(y_true, y_prob, labels=[0, 1])),
        "brierScore": float(brier_score_loss(y_true, y_prob)),
        "calibration": calibration_summary(y_true, y_prob, CALIBRATION_BINS),
    }
    if len(np.unique(y_true)) > 1:
        summary["rocAuc"] = float(roc_auc_score(y_true, y_prob))
        summary["prAuc"] = float(average_precision_score(y_true, y_prob))
    else:
        summary["rocAuc"] = None
        summary["prAuc"] = None
    return summary


def metric_sort_value(value: float | None, *, reverse: bool = False) -> float:
    if value is None:
        return float("-inf") if reverse else float("inf")
    return -float(value) if reverse else float(value)


def choose_winner(evaluation: dict[str, Any]) -> dict[str, Any]:
    ranking = []
    for model_name, model_summary in evaluation["models"].items():
        validation = model_summary["validation"]
        ranking.append(
            {
                "model": model_name,
                "validationLogLoss": validation["logLoss"],
                "validationBrierScore": validation["brierScore"],
                "validationRocAuc": validation["rocAuc"],
                "validationPrAuc": validation["prAuc"],
                "validationEce": validation["calibration"]["expectedCalibrationError"],
                "validationAccuracy": validation["accuracy"],
            }
        )

    ranking.sort(
        key=lambda row: (
            metric_sort_value(row["validationLogLoss"]),
            metric_sort_value(row["validationBrierScore"]),
            metric_sort_value(row["validationRocAuc"], reverse=True),
            metric_sort_value(row["validationPrAuc"], reverse=True),
            metric_sort_value(row["validationEce"]),
            metric_sort_value(row["validationAccuracy"], reverse=True),
            row["model"],
        )
    )
    for index, row in enumerate(ranking, start=1):
        row["rank"] = index

    winner_name = ranking[0]["model"]
    return {
        "selectionSplit": "validation",
        "selectionPolicy": (
            "Winner is selected by lowest validation log loss, with Brier score, ROC-AUC, PR-AUC, "
            "expected calibration error, and accuracy used as ordered tie-breakers."
        ),
        "winnerModel": winner_name,
        "validationRanking": ranking,
        "winnerValidationMetrics": evaluation["models"][winner_name]["validation"],
        "winnerTestMetrics": evaluation["models"][winner_name]["test"],
    }


def build_preprocessor(
    numeric_features: list[str], categorical_features: list[str]
) -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_features,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="constant", fill_value="__missing__")),
                        (
                            "encoder",
                            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                        ),
                    ]
                ),
                categorical_features,
            ),
        ],
        remainder="drop",
    )


def load_snapshot(snapshot_dir: Path) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    dataset_path = snapshot_dir / "dataset.csv"
    metadata_path = snapshot_dir / "metadata.json"
    schema_path = snapshot_dir / "schema.json"
    if not dataset_path.exists():
        raise FileNotFoundError(f"Missing dataset.csv in {snapshot_dir}")
    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata.json in {snapshot_dir}")
    if not schema_path.exists():
        raise FileNotFoundError(f"Missing schema.json in {snapshot_dir}")

    frame = pd.read_csv(dataset_path)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return frame, metadata, schema


def prepare_learning_content_dataset(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    dataset = frame.copy()
    dataset["deliveredAtIso"] = pd.to_datetime(dataset["deliveredAtIso"], utc=True)
    dataset["episodePrecheckAccuracy"] = pd.to_numeric(
        dataset["episodePrecheckAccuracy"], errors="coerce"
    )
    dataset["labelNextPrimaryOutcomeAccuracy"] = pd.to_numeric(
        dataset["labelNextPrimaryOutcomeAccuracy"], errors="coerce"
    )
    dataset["labelPostcheckMinusPrecheck"] = pd.to_numeric(
        dataset["labelPostcheckMinusPrecheck"], errors="coerce"
    )
    dataset["sequenceIndex"] = pd.to_numeric(dataset["sequenceIndex"], errors="coerce")

    filtered = dataset.loc[
        (dataset["sequenceRole"] == "learning_content")
        & dataset["labelNextPrimaryOutcomeAccuracy"].notna()
        & dataset["deliveredDifficulty"].notna()
        & dataset["deliveredDepth"].notna()
    ].copy()
    if filtered.empty:
        raise ValueError("No learning_content rows with next-primary-outcome labels were found.")

    filtered.sort_values(
        by=["deliveredAtIso", "learnerRef", "episodeRef", "sequenceIndex"],
        inplace=True,
    )
    filtered.reset_index(drop=True, inplace=True)

    engineered_rows: list[dict[str, Any]] = []
    learner_history: dict[str, dict[str, Any]] = {}

    def normalize_category(value: Any) -> str:
        return "__missing__" if pd.isna(value) else str(value)

    for row in filtered.itertuples(index=False):
        learner_ref = str(row.learnerRef)
        delivered_difficulty = str(row.deliveredDifficulty)
        delivered_depth = str(row.deliveredDepth)
        skill_key = normalize_category(row.skillKey)
        concept_key = normalize_category(row.conceptKey)
        subject_ref = normalize_category(row.subjectRef)
        policy_arm = normalize_category(row.episodePolicyArm)

        history = learner_history.setdefault(
            learner_ref,
            {
                "rows": 0,
                "successes": 0,
                "gain_values": [],
                "skill": {},
                "difficulty": {},
                "depth": {},
            },
        )

        def history_rate(scope: dict[str, list[int]], key: str) -> tuple[int, float | None]:
            values = scope.get(key, [])
            if not values:
                return 0, None
            return len(values), float(sum(values) / len(values))

        skill_rows, skill_success_rate = history_rate(history["skill"], skill_key)
        difficulty_rows, difficulty_success_rate = history_rate(
            history["difficulty"], delivered_difficulty
        )
        depth_rows, depth_success_rate = history_rate(history["depth"], delivered_depth)

        engineered_rows.append(
            {
                "learnerRef": learner_ref,
                "episodeRef": str(row.episodeRef),
                "deliveredAtIso": row.deliveredAtIso.isoformat(),
                "targetNextTaskSuccess": int(
                    float(row.labelNextPrimaryOutcomeAccuracy) >= TARGET_SUCCESS_THRESHOLD
                ),
                "targetNextTaskAccuracy": float(row.labelNextPrimaryOutcomeAccuracy),
                "deliveredDifficulty": delivered_difficulty,
                "deliveredDepth": delivered_depth,
                "episodePolicyArm": policy_arm,
                "skillKey": skill_key,
                "conceptKey": concept_key,
                "subjectRef": subject_ref,
                "episodePrecheckAccuracy": float(row.episodePrecheckAccuracy)
                if not math.isnan(float(row.episodePrecheckAccuracy))
                else None,
                "priorLearnerRows": int(history["rows"]),
                "priorLearnerSuccessRate": (
                    float(history["successes"] / history["rows"]) if history["rows"] > 0 else None
                ),
                "priorSkillRows": int(skill_rows),
                "priorSkillSuccessRate": skill_success_rate,
                "priorDifficultyRows": int(difficulty_rows),
                "priorDifficultySuccessRate": difficulty_success_rate,
                "priorDepthRows": int(depth_rows),
                "priorDepthSuccessRate": depth_success_rate,
                "priorAvgObservedGain": (
                    float(np.mean(history["gain_values"])) if history["gain_values"] else None
                ),
                "datasetOrigin": normalize_category(row.datasetOrigin),
                "snapshotPhase": normalize_category(row.snapshotPhase),
            }
        )

        success = int(float(row.labelNextPrimaryOutcomeAccuracy) >= TARGET_SUCCESS_THRESHOLD)
        history["rows"] += 1
        history["successes"] += success
        history["gain_values"].append(
            0.0 if pd.isna(row.labelPostcheckMinusPrecheck) else float(row.labelPostcheckMinusPrecheck)
        )
        history["skill"].setdefault(skill_key, []).append(success)
        history["difficulty"].setdefault(delivered_difficulty, []).append(success)
        history["depth"].setdefault(delivered_depth, []).append(success)

    engineered = pd.DataFrame(engineered_rows)
    feature_info = {
        "rowFilter": "sequenceRole == learning_content and labelNextPrimaryOutcomeAccuracy is not null",
        "target": {
            "name": "targetNextTaskSuccess",
            "definition": f"1 if labelNextPrimaryOutcomeAccuracy >= {TARGET_SUCCESS_THRESHOLD:.4f}, else 0",
        },
    }
    return engineered, feature_info


def split_dataset(frame: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    total = len(frame)
    if total < 60:
        raise ValueError("Prepared dataset is too small for a train/validation/test comparison.")

    train_end = max(20, int(total * TRAIN_RATIO))
    validation_end = max(train_end + 10, int(total * (TRAIN_RATIO + VALIDATION_RATIO)))
    validation_end = min(validation_end, total - 10)

    train_df = frame.iloc[:train_end].copy()
    validation_df = frame.iloc[train_end:validation_end].copy()
    test_df = frame.iloc[validation_end:].copy()

    if min(len(train_df), len(validation_df), len(test_df)) < 10:
        raise ValueError("One of the dataset splits is too small after chronological partitioning.")

    split_metadata = {
        "strategy": "global_chronological_split_by_learning_content_delivery_time",
        "ratios": {
            "train": TRAIN_RATIO,
            "validation": VALIDATION_RATIO,
            "test": 1 - TRAIN_RATIO - VALIDATION_RATIO,
        },
        "counts": {
            "total": total,
            "train": int(len(train_df)),
            "validation": int(len(validation_df)),
            "test": int(len(test_df)),
        },
        "timeRange": {
            "trainStart": train_df["deliveredAtIso"].min(),
            "trainEnd": train_df["deliveredAtIso"].max(),
            "validationStart": validation_df["deliveredAtIso"].min(),
            "validationEnd": validation_df["deliveredAtIso"].max(),
            "testStart": test_df["deliveredAtIso"].min(),
            "testEnd": test_df["deliveredAtIso"].max(),
        },
    }
    return train_df, validation_df, test_df, split_metadata


def train_models(
    run_dir: Path,
    prepared_frame: pd.DataFrame,
) -> tuple[dict[str, Any], dict[str, Pipeline], dict[str, Any]]:
    numeric_features = [
        "episodePrecheckAccuracy",
        "priorLearnerRows",
        "priorLearnerSuccessRate",
        "priorSkillRows",
        "priorSkillSuccessRate",
        "priorDifficultyRows",
        "priorDifficultySuccessRate",
        "priorDepthRows",
        "priorDepthSuccessRate",
        "priorAvgObservedGain",
    ]
    categorical_features = [
        "deliveredDifficulty",
        "deliveredDepth",
        "episodePolicyArm",
        "skillKey",
        "conceptKey",
        "subjectRef",
        "datasetOrigin",
        "snapshotPhase",
    ]

    train_df, validation_df, test_df, split_metadata = split_dataset(prepared_frame)
    x_train = train_df[numeric_features + categorical_features]
    y_train = train_df["targetNextTaskSuccess"].astype(int).to_numpy()
    x_validation = validation_df[numeric_features + categorical_features]
    y_validation = validation_df["targetNextTaskSuccess"].astype(int).to_numpy()
    x_test = test_df[numeric_features + categorical_features]
    y_test = test_df["targetNextTaskSuccess"].astype(int).to_numpy()

    models: dict[str, Pipeline] = {
        "logistic_regression": Pipeline(
            steps=[
                ("preprocessor", build_preprocessor(numeric_features, categorical_features)),
                (
                    "classifier",
                    LogisticRegression(
                        max_iter=2000,
                        solver="lbfgs",
                        class_weight="balanced",
                        random_state=42,
                    ),
                ),
            ]
        ),
        "hist_gradient_boosting": Pipeline(
            steps=[
                ("preprocessor", build_preprocessor(numeric_features, categorical_features)),
                (
                    "classifier",
                    HistGradientBoostingClassifier(
                        max_depth=5,
                        learning_rate=0.08,
                        max_iter=250,
                        min_samples_leaf=8,
                        random_state=42,
                    ),
                ),
            ]
        ),
    }

    trained_models: dict[str, Pipeline] = {}
    training_summary: dict[str, Any] = {}
    evaluation_summary: dict[str, Any] = {"models": {}}
    models_dir = ensure_dir(run_dir / "models")

    for model_name, model in models.items():
        model.fit(x_train, y_train)
        trained_models[model_name] = model
        model_path = models_dir / f"{model_name}.joblib"
        joblib.dump(model, model_path)

        validation_prob = model.predict_proba(x_validation)[:, 1]
        test_prob = model.predict_proba(x_test)[:, 1]

        evaluation_summary["models"][model_name] = {
            "validation": score_predictions(y_validation, validation_prob),
            "test": score_predictions(y_test, test_prob),
            "modelPath": str(model_path),
        }
        training_summary[model_name] = {
            "modelPath": str(model_path),
            "trainSamples": int(len(train_df)),
            "featureCount": int(len(numeric_features) + len(categorical_features)),
        }

    feature_schema = {
        "schemaVersion": WORKSPACE_SCHEMA_VERSION,
        "numericFeatures": numeric_features,
        "categoricalFeatures": categorical_features,
        "target": "targetNextTaskSuccess",
    }

    save_json(run_dir / "feature_schema.json", feature_schema)
    save_json(run_dir / "split_metadata.json", split_metadata)
    save_json(run_dir / "model_training_summary.json", training_summary)
    prepared_frame.to_csv(run_dir / "prepared_learning_content_dataset.csv", index=False)

    return evaluation_summary, trained_models, feature_schema


def build_markdown_summary(
    comparison: dict[str, Any],
    evaluation: dict[str, Any],
    snapshot_dir: Path,
    run_dir: Path,
) -> str:
    winner = comparison["winnerModel"]
    lines = [
        "# EduAI Native Synthetic Training Summary",
        "",
        f"- Snapshot: `{snapshot_dir}`",
        f"- Training run: `{run_dir}`",
        f"- Winner: `{winner}`",
        "",
        "## Validation Ranking",
        "",
        "| Rank | Model | Log Loss | Brier | ROC-AUC | PR-AUC | Accuracy | ECE |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in comparison["validationRanking"]:
        lines.append(
            "| {rank} | {model} | {log_loss:.4f} | {brier:.4f} | {roc_auc} | {pr_auc} | {accuracy:.4f} | {ece:.4f} |".format(
                rank=row["rank"],
                model=row["model"],
                log_loss=row["validationLogLoss"],
                brier=row["validationBrierScore"],
                roc_auc="n/a" if row["validationRocAuc"] is None else f"{row['validationRocAuc']:.4f}",
                pr_auc="n/a" if row["validationPrAuc"] is None else f"{row['validationPrAuc']:.4f}",
                accuracy=row["validationAccuracy"],
                ece=row["validationEce"],
            )
        )
    lines.extend(
        [
            "",
            "## Honesty Note",
            "",
            "- This result is based on synthetic internal EduAI-native data.",
            "- It validates native export/training/handoff mechanics, not real-user efficacy.",
        ]
    )
    return "\n".join(lines)


def package_runtime_artifact(
    repo_root: Path,
    run_dir: Path,
    snapshot_dir: Path,
    metadata: dict[str, Any],
    feature_schema: dict[str, Any],
    evaluation: dict[str, Any],
    comparison: dict[str, Any],
) -> dict[str, Any]:
    slot_dir = ensure_dir(repo_root / "artifacts" / "runtime" / "eduai_native_pedagogy" / "current")
    support_dir = ensure_dir(slot_dir / "files")
    winner = comparison["winnerModel"]
    winner_model_source = run_dir / "models" / f"{winner}.joblib"
    if not winner_model_source.exists():
        raise FileNotFoundError(f"Winner model file is missing: {winner_model_source}")

    winner_model_target = support_dir / "winner_model.joblib"
    feature_schema_target = support_dir / "feature_schema.json"
    comparison_target = support_dir / "comparison_summary.json"
    evaluation_target = support_dir / "evaluation_summary.json"
    snapshot_metadata_target = support_dir / "snapshot_metadata.json"

    shutil.copy2(winner_model_source, winner_model_target)
    save_json(feature_schema_target, feature_schema)
    save_json(comparison_target, comparison)
    save_json(evaluation_target, evaluation)
    save_json(snapshot_metadata_target, metadata)

    dataset_origins = sorted(
        {
            str(value)
            for value in pd.read_csv(snapshot_dir / "dataset.csv")["datasetOrigin"].dropna().unique().tolist()
        }
    )
    generation_run_id = None
    for origin in dataset_origins:
        prefix = "synthetic_internal_bridge_"
        if origin.startswith(prefix):
            generation_run_id = origin[len(prefix) :]
            break

    artifact = {
        "artifactKind": RUNTIME_ARTIFACT_KIND,
        "artifactSchemaVersion": RUNTIME_ARTIFACT_SCHEMA_VERSION,
        "createdAtIso": utc_now_iso(),
        "stage": "synthetic_internal_bridge",
        "runtimeServingActive": False,
        "activationMode": "manual_future_switch_only",
        "objective": "predict_next_task_success_probability_for_learning_content_decisions",
        "successDefinition": f"next primary outcome accuracy >= {TARGET_SUCCESS_THRESHOLD:.4f}",
        "targets": ["difficulty", "depth"],
        "decisionSpace": {
            "difficulty": ["easy", "medium", "hard"],
            "depth": ["brief", "standard", "detailed"],
        },
        "selectedModel": {
            "name": winner,
            "validation": comparison["winnerValidationMetrics"],
            "test": comparison["winnerTestMetrics"],
            "relativeModelPath": str(winner_model_target.relative_to(repo_root)),
        },
        "trainingProvenance": {
            "sourcePhase": metadata.get("phase"),
            "datasetSnapshotDir": str(snapshot_dir.relative_to(repo_root)),
            "datasetSnapshotId": metadata.get("snapshotId"),
            "datasetOrigins": dataset_origins,
            "generationRunId": generation_run_id,
            "trainingRunId": run_dir.name,
            "workspace": "bootstrap_training/eduai_native_synthetic",
        },
        "packageFiles": {
            "featureSchema": str(feature_schema_target.relative_to(repo_root)),
            "comparisonSummary": str(comparison_target.relative_to(repo_root)),
            "evaluationSummary": str(evaluation_target.relative_to(repo_root)),
            "snapshotMetadata": str(snapshot_metadata_target.relative_to(repo_root)),
        },
        "honestyNotes": [
            "Synthetic internal artifact only.",
            "Not evidence of real-user personalization efficacy.",
            "Website runtime serving remains inactive after this handoff.",
        ],
    }
    slot_metadata = {
        "slotKind": RUNTIME_SLOT_KIND,
        "slotSchemaVersion": RUNTIME_SLOT_SCHEMA_VERSION,
        "slotStatus": "artifact_present",
        "runtimeIntegrationStatus": "inactive_pending_activation",
        "expectedTargets": ["difficulty", "depth"],
        "expectedTrainingDatasetSchemaVersion": metadata.get("contract", {}).get("schemaVersion"),
        "artifactRelativePath": "artifacts/runtime/eduai_native_pedagogy/current/artifact.json",
        "metadataRelativePath": "artifacts/runtime/eduai_native_pedagogy/current/slot_metadata.json",
        "supportFilesRelativeDir": "artifacts/runtime/eduai_native_pedagogy/current/files",
        "provenance": {
            "sourcePhase": metadata.get("phase"),
            "datasetOrigin": dataset_origins[0] if dataset_origins else None,
            "generationRunId": generation_run_id,
            "trainingRunId": run_dir.name,
            "handedOffAtIso": utc_now_iso(),
        },
        "notes": [
            "Runtime slot now contains a synthetic internal EduAI-native artifact package.",
            "Serving is still inactive and requires an explicit later activation step.",
            "This artifact must not be presented as real-user validation.",
        ],
    }

    artifact_path = slot_dir / "artifact.json"
    slot_metadata_path = slot_dir / "slot_metadata.json"
    save_json(artifact_path, artifact)
    save_json(slot_metadata_path, slot_metadata)

    placeholder_metadata = slot_dir / "slot_metadata.placeholder.json"
    if placeholder_metadata.exists():
        placeholder_metadata.unlink()

    return {
        "artifactPath": str(artifact_path),
        "slotMetadataPath": str(slot_metadata_path),
        "winnerModelPath": str(winner_model_target),
    }


def main() -> None:
    args = parse_args()
    repo_root = resolve_repo_root()
    workspace_root = resolve_workspace_root()
    snapshot_dir = resolve_snapshot_dir(repo_root, args.snapshot_dir)
    run_id = build_run_id(args.run_id)
    run_dir = ensure_dir(
        workspace_root / "data" / "artifacts" / "training_runs" / run_id
    )

    frame, metadata, schema = load_snapshot(snapshot_dir)
    prepared_frame, feature_info = prepare_learning_content_dataset(frame)
    evaluation, trained_models, feature_schema = train_models(run_dir, prepared_frame)
    _ = trained_models
    evaluation["generatedAtUtc"] = utc_now_iso()
    evaluation["snapshotDir"] = str(snapshot_dir)
    evaluation["workspaceSchemaVersion"] = WORKSPACE_SCHEMA_VERSION
    evaluation["featureInfo"] = feature_info
    evaluation["inputSchema"] = schema
    save_json(run_dir / "evaluation_summary.json", evaluation)

    comparison = choose_winner(evaluation)
    comparison["generatedAtUtc"] = utc_now_iso()
    comparison["honestyNotes"] = [
        "This is a synthetic internal bridge result.",
        "Good offline metrics here do not prove real-user effectiveness.",
    ]
    save_json(run_dir / "comparison_summary.json", comparison)
    save_text(
        run_dir / "comparison_summary.md",
        build_markdown_summary(comparison, evaluation, snapshot_dir, run_dir),
    )

    runtime_handoff = None
    if not args.skip_runtime_handoff:
        runtime_handoff = package_runtime_artifact(
            repo_root=repo_root,
            run_dir=run_dir,
            snapshot_dir=snapshot_dir,
            metadata=metadata,
            feature_schema=feature_schema,
            evaluation=evaluation,
            comparison=comparison,
        )

    result = {
        "workspaceSchemaVersion": WORKSPACE_SCHEMA_VERSION,
        "snapshotDir": str(snapshot_dir),
        "trainingRunDir": str(run_dir),
        "preparedRows": int(len(prepared_frame)),
        "winnerModel": comparison["winnerModel"],
        "runtimeHandoff": runtime_handoff,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
