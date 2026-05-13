from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)

from common import (
    build_paths,
    ensure_workspace_directories,
    format_markdown_table,
    load_config,
    prepare_model_inputs,
    save_json,
    save_text,
    to_native,
    utc_now_iso,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate trained model artifacts on validation/test splits.")
    parser.add_argument("--config", default=None, help="Path to workspace config JSON.")
    parser.add_argument(
        "--run-dir",
        default=None,
        help="Training run directory under data/artifacts/training_runs/<run-id>.",
    )
    parser.add_argument(
        "--splits",
        nargs="*",
        default=["validation", "test"],
        help="Evaluation splits to score.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate config and dataset loading without scoring artifacts.",
    )
    return parser.parse_args()


def resolve_run_dir(paths: dict[str, Path], explicit_run_dir: str | None) -> Path:
    if explicit_run_dir:
        candidate = Path(explicit_run_dir)
        if not candidate.is_absolute():
            candidate = paths["artifacts_dir"] / "training_runs" / candidate
        return candidate

    training_root = paths["artifacts_dir"] / "training_runs"
    if not training_root.exists():
        raise FileNotFoundError("No training runs are available under data/artifacts/training_runs.")

    candidates = sorted([path for path in training_root.iterdir() if path.is_dir()])
    if not candidates:
        raise FileNotFoundError("No training run directories were found.")
    return candidates[-1]


def expected_calibration_error(y_true: np.ndarray, y_prob: np.ndarray, bins: int) -> dict[str, Any]:
    edges = np.linspace(0.0, 1.0, bins + 1)
    assignments = np.digitize(y_prob, edges[1:-1], right=True)
    bin_rows = []
    total = len(y_true)
    ece = 0.0

    for bin_index in range(bins):
        mask = assignments == bin_index
        count = int(mask.sum())
        if count == 0:
            continue
        observed_rate = float(y_true[mask].mean())
        predicted_rate = float(y_prob[mask].mean())
        gap = abs(observed_rate - predicted_rate)
        ece += gap * (count / total)
        bin_rows.append(
            {
                "bin": bin_index,
                "count": count,
                "predicted_mean": predicted_rate,
                "observed_rate": observed_rate,
                "absolute_gap": gap,
            }
        )

    return {"expected_calibration_error": ece, "bins": bin_rows}


def score_predictions(y_true: np.ndarray, y_prob: np.ndarray, bins: int) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "accuracy": float(accuracy_score(y_true, y_prob >= 0.5)),
        "log_loss": float(log_loss(y_true, y_prob, labels=[0, 1])),
        "brier_score": float(brier_score_loss(y_true, y_prob)),
        "positive_rate": float(np.mean(y_true)),
        "predicted_positive_rate_at_0_5": float(np.mean(y_prob >= 0.5)),
    }

    if len(np.unique(y_true)) > 1:
        metrics["roc_auc"] = float(roc_auc_score(y_true, y_prob))
        metrics["pr_auc"] = float(average_precision_score(y_true, y_prob))
    else:
        metrics["roc_auc"] = None
        metrics["pr_auc"] = None

    metrics["calibration"] = expected_calibration_error(y_true, y_prob, bins)
    return metrics


def metric_value(metrics: dict[str, Any], metric_name: str) -> float:
    value = metrics.get(metric_name)
    if value is None:
        return float("nan")
    return float(value)


def rank_models(models_summary: dict[str, Any], split_name: str) -> list[dict[str, Any]]:
    ranking_rows = []
    for model_name, split_metrics in models_summary.items():
        metrics = split_metrics.get(split_name, {})
        ranking_rows.append(
            {
                "model_name": model_name,
                "roc_auc": metric_value(metrics, "roc_auc"),
                "pr_auc": metric_value(metrics, "pr_auc"),
                "log_loss": metric_value(metrics, "log_loss"),
                "brier_score": metric_value(metrics, "brier_score"),
                "accuracy": metric_value(metrics, "accuracy"),
                "expected_calibration_error": metric_value(
                    metrics.get("calibration", {}), "expected_calibration_error"
                ),
            }
        )

    ranking_rows.sort(
        key=lambda row: (
            row["log_loss"],
            row["brier_score"],
            -row["roc_auc"],
            -row["pr_auc"],
            row["expected_calibration_error"],
            -row["accuracy"],
            row["model_name"],
        )
    )

    for index, row in enumerate(ranking_rows, start=1):
        row["rank"] = index

    return ranking_rows


def choose_winner(models_summary: dict[str, Any], selection_split: str) -> dict[str, Any]:
    ranking = rank_models(models_summary, selection_split)
    if not ranking:
        raise ValueError("No models were available for winner selection.")

    winner_row = ranking[0]
    winner_name = winner_row["model_name"]
    return {
        "selection_split": selection_split,
        "selection_policy": (
            "Winner is selected by lowest validation log loss, with Brier score, ROC-AUC, PR-AUC, "
            "expected calibration error, and accuracy used as ordered tie-breakers."
        ),
        "winner_model": winner_name,
        "winner_metrics_on_selection_split": models_summary[winner_name][selection_split],
        "ranking": ranking,
    }


def metric_leaders(models_summary: dict[str, Any], split_name: str) -> dict[str, str]:
    available_metrics = {
        "roc_auc": max,
        "pr_auc": max,
        "log_loss": min,
        "brier_score": min,
        "accuracy": max,
        "expected_calibration_error": min,
    }
    leaders: dict[str, str] = {}
    for metric_name, reducer in available_metrics.items():
        values = []
        for model_name, split_metrics in models_summary.items():
            metrics = split_metrics.get(split_name, {})
            if metric_name == "expected_calibration_error":
                value = metrics.get("calibration", {}).get("expected_calibration_error")
            else:
                value = metrics.get(metric_name)
            if value is None:
                continue
            values.append((model_name, float(value)))
        if not values:
            continue
        chosen = reducer(values, key=lambda item: item[1])[0]
        leaders[metric_name] = chosen
    return leaders


def calibration_post_check(metrics: dict[str, Any]) -> dict[str, Any]:
    validation_ece = float(metrics["validation"]["calibration"]["expected_calibration_error"])
    test_ece = float(metrics["test"]["calibration"]["expected_calibration_error"])
    max_ece = max(validation_ece, test_ece)

    if max_ece <= 0.02:
        status = "good"
        recommendation = "Separate calibration step is optional; probability quality already looks strong for a bootstrap baseline."
    elif max_ece <= 0.05:
        status = "acceptable"
        recommendation = "Separate calibration step is not mandatory immediately, but should be evaluated before any runtime-facing use."
    else:
        status = "needs_follow_up"
        recommendation = "A separate probability calibration step is recommended before any downstream policy use."

    return {
        "status": status,
        "validation_ece": validation_ece,
        "test_ece": test_ece,
        "recommendation": recommendation,
    }


def build_comparison(summary: dict[str, Any], selection_split: str = "validation") -> dict[str, Any]:
    winner = choose_winner(summary["models"], selection_split)
    winner_name = winner["winner_model"]
    leaders = {
        split_name: metric_leaders(summary["models"], split_name) for split_name in ["validation", "test"]
    }
    return {
        "generated_at_utc": summary["generated_at_utc"],
        "selection_split": selection_split,
        "selection_policy": winner["selection_policy"],
        "winner_model": winner_name,
        "winner_metrics": {
            split_name: summary["models"][winner_name][split_name] for split_name in summary["models"][winner_name]
        },
        "validation_ranking": winner["ranking"],
        "test_ranking": rank_models(summary["models"], "test"),
        "metric_leaders": leaders,
        "winner_tradeoff_note": (
            "Winner is optimized for probability-quality ranking via validation log loss, not for accuracy alone."
        ),
        "calibration_post_check": calibration_post_check(summary["models"][winner_name]),
    }


def ranking_table(rows: list[dict[str, Any]]) -> str:
    lines = [
        "| Rank | Model | ROC-AUC | PR-AUC | Log Loss | Brier | Accuracy | ECE |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            "| {rank} | {model_name} | {roc_auc:.6f} | {pr_auc:.6f} | {log_loss:.6f} | "
            "{brier_score:.6f} | {accuracy:.6f} | {expected_calibration_error:.6f} |".format(**row)
        )
    return "\n".join(lines)


def render_model_markdown(model_name: str, split_metrics: dict[str, Any]) -> str:
    lines = [f"# {model_name}", ""]
    for split_name, metrics in split_metrics.items():
        lines.append(f"## {split_name}")
        lines.append(
            format_markdown_table(
                [
                    ("ROC-AUC", str(metrics["roc_auc"])),
                    ("PR-AUC", str(metrics["pr_auc"])),
                    ("Log Loss", str(metrics["log_loss"])),
                    ("Brier Score", str(metrics["brier_score"])),
                    ("Accuracy", str(metrics["accuracy"])),
                    ("Expected Calibration Error", str(metrics["calibration"]["expected_calibration_error"])),
                ]
            )
        )
        lines.append("")
    return "\n".join(lines)


def render_markdown(summary: dict[str, Any], comparison: dict[str, Any]) -> str:
    lines = [
        "# Evaluation Summary",
        "",
        format_markdown_table(
            [
                ("Generated At (UTC)", summary["generated_at_utc"]),
                ("Run Directory", summary["run_directory"]),
                ("Processed Dataset", summary["processed_dataset_path"]),
                ("Winner Model", comparison["winner_model"]),
                ("Selection Split", comparison["selection_split"]),
            ]
        ),
        "",
        "## Winner Selection",
        "",
        comparison["selection_policy"],
        "",
        "## Validation Ranking",
        "",
        ranking_table(comparison["validation_ranking"]),
        "",
        "## Test Ranking",
        "",
        ranking_table(comparison["test_ranking"]),
        "",
    ]

    for model_name, split_metrics in summary["models"].items():
        lines.append(f"## {model_name}")
        for split_name, metrics in split_metrics.items():
            lines.append(f"### {split_name}")
            lines.append(
                format_markdown_table(
                    [
                        ("ROC-AUC", str(metrics["roc_auc"])),
                        ("PR-AUC", str(metrics["pr_auc"])),
                        ("Log Loss", str(metrics["log_loss"])),
                        ("Brier Score", str(metrics["brier_score"])),
                        ("Accuracy", str(metrics["accuracy"])),
                        (
                            "Expected Calibration Error",
                            str(metrics["calibration"]["expected_calibration_error"]),
                        ),
                    ]
                )
            )
            lines.append("")

    lines.extend(
        [
            "## Calibration Post-Check",
            "",
            format_markdown_table(
                [
                    ("Status", comparison["calibration_post_check"]["status"]),
                    ("Validation ECE", str(comparison["calibration_post_check"]["validation_ece"])),
                    ("Test ECE", str(comparison["calibration_post_check"]["test_ece"])),
                    ("Recommendation", comparison["calibration_post_check"]["recommendation"]),
                ]
            ),
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    config, _ = load_config(args.config)
    paths = build_paths(config)
    ensure_workspace_directories(paths)

    dataset = pd.read_parquet(paths["processed_dataset"])
    schema = json.loads(paths["feature_schema"].read_text(encoding="utf-8"))

    if args.dry_run:
        run_dir_preview = args.run_dir or "<not-required-for-dry-run>"
        print(
            "Dry run OK: "
            f"dataset_rows={len(dataset)}, requested_splits={', '.join(args.splits)}, run_dir={run_dir_preview}"
        )
        return

    run_dir = resolve_run_dir(paths, args.run_dir)
    models_dir = run_dir / "models"

    numeric_features = schema["numeric_feature_columns"]
    categorical_features = schema["categorical_feature_columns"]
    feature_columns = numeric_features + categorical_features
    bins = config["evaluation"]["calibration_bins"]

    summary: dict[str, Any] = {
        "generated_at_utc": utc_now_iso(),
        "run_directory": str(run_dir),
        "processed_dataset_path": str(paths["processed_dataset"]),
        "feature_schema_path": str(paths["feature_schema"]),
        "split_metadata_path": str(paths["split_metadata"]),
        "models": {},
    }

    artifact_paths = sorted(models_dir.glob("*.joblib"))
    if not artifact_paths:
        raise FileNotFoundError(f"No model artifacts were found in {models_dir}.")

    evaluation_dir = run_dir / "evaluation"
    evaluation_dir.mkdir(parents=True, exist_ok=True)

    for artifact_path in artifact_paths:
        model_name = artifact_path.stem
        model = joblib.load(artifact_path)
        model_summary: dict[str, Any] = {}

        for split_name in args.splits:
            split_df = dataset.loc[dataset["split"] == split_name].copy()
            x_split = prepare_model_inputs(split_df, numeric_features, categorical_features)
            y_split = split_df["correct"].astype(int).to_numpy()
            y_prob = model.predict_proba(x_split)[:, 1]
            model_summary[split_name] = score_predictions(y_split, y_prob, bins)
            pd.DataFrame(model_summary[split_name]["calibration"]["bins"]).to_csv(
                evaluation_dir / f"{model_name}_{split_name}_calibration_bins.csv",
                index=False,
            )

        summary["models"][model_name] = model_summary
        save_json(evaluation_dir / f"{model_name}_summary.json", to_native(model_summary))
        save_text(evaluation_dir / f"{model_name}_summary.md", render_model_markdown(model_name, model_summary))

    comparison = build_comparison(summary)
    save_json(run_dir / "evaluation_summary.json", to_native(summary))
    save_json(run_dir / "comparison_summary.json", to_native(comparison))
    save_text(run_dir / "evaluation_summary.md", render_markdown(summary, comparison))
    save_text(
        run_dir / "comparison_summary.md",
        "\n".join(
            [
                "# Comparison Summary",
                "",
                format_markdown_table(
                    [
                        ("Winner Model", comparison["winner_model"]),
                        ("Selection Split", comparison["selection_split"]),
                        ("Selection Policy", comparison["selection_policy"]),
                        ("Calibration Post-Check", comparison["calibration_post_check"]["recommendation"]),
                    ]
                ),
                "",
                "## Validation Ranking",
                "",
                ranking_table(comparison["validation_ranking"]),
                "",
                "## Test Ranking",
                "",
                ranking_table(comparison["test_ranking"]),
                "",
            ]
        ),
    )
    print(f"Saved evaluation summary to: {run_dir / 'evaluation_summary.json'}")


if __name__ == "__main__":
    main()
