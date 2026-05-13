from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

from common import build_paths, load_config, prepare_model_inputs, save_json, to_native, utc_now_iso
from common import ensure_workspace_directories


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train baseline sklearn classifiers on the processed dataset.")
    parser.add_argument("--config", default=None, help="Path to workspace config JSON.")
    parser.add_argument(
        "--models",
        nargs="*",
        default=None,
        help="Optional subset of models to train. Defaults to all enabled models.",
    )
    parser.add_argument("--run-id", default=None, help="Optional explicit training run identifier.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate config and dataset loading without fitting any model.",
    )
    return parser.parse_args()


def load_inputs(paths: dict[str, Path]) -> tuple[pd.DataFrame, dict[str, Any]]:
    dataset = pd.read_parquet(paths["processed_dataset"])
    schema = json.loads(paths["feature_schema"].read_text(encoding="utf-8"))
    return dataset, schema


def build_logistic_pipeline(
    numeric_features: list[str], categorical_features: list[str], model_config: dict[str, Any], random_state: int
) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                        ("scaler", StandardScaler(with_mean=False)),
                    ]
                ),
                numeric_features,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        (
                            "imputer",
                            SimpleImputer(strategy="constant", fill_value="__missing__"),
                        ),
                        (
                            "encoder",
                            OneHotEncoder(
                                handle_unknown="infrequent_if_exist",
                                min_frequency=model_config.get("min_frequency", 25),
                                sparse_output=True,
                            ),
                        ),
                    ]
                ),
                categorical_features,
            ),
        ]
    )
    classifier = LogisticRegression(
        solver="saga",
        penalty="l2",
        max_iter=model_config.get("max_iter", 1200),
        C=model_config.get("C", 1.0),
        random_state=random_state,
    )
    return Pipeline(steps=[("preprocessor", preprocessor), ("classifier", classifier)])


def build_tree_pipeline(
    estimator: Any, numeric_features: list[str], categorical_features: list[str]
) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "numeric",
                SimpleImputer(strategy="median", keep_empty_features=True),
                numeric_features,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        (
                            "imputer",
                            SimpleImputer(strategy="constant", fill_value="__missing__"),
                        ),
                        (
                            "encoder",
                            OrdinalEncoder(
                                handle_unknown="use_encoded_value",
                                unknown_value=-1,
                                encoded_missing_value=-1,
                            ),
                        ),
                    ]
                ),
                categorical_features,
            ),
        ],
        sparse_threshold=0.0,
    )
    return Pipeline(steps=[("preprocessor", preprocessor), ("classifier", estimator)])


def build_model_registry(
    config: dict[str, Any], numeric_features: list[str], categorical_features: list[str]
) -> dict[str, Pipeline]:
    random_state = config["workspace"]["random_state"]
    models_config = config["models"]

    registry: dict[str, Pipeline] = {}
    if models_config["logistic_regression"]["enabled"]:
        registry["logistic_regression"] = build_logistic_pipeline(
            numeric_features,
            categorical_features,
            models_config["logistic_regression"],
            random_state,
        )

    if models_config["random_forest"]["enabled"]:
        rf_config = models_config["random_forest"]
        registry["random_forest"] = build_tree_pipeline(
            RandomForestClassifier(
                n_estimators=rf_config["n_estimators"],
                max_depth=rf_config["max_depth"],
                min_samples_leaf=rf_config["min_samples_leaf"],
                max_features=rf_config["max_features"],
                n_jobs=-1,
                random_state=random_state,
            ),
            numeric_features,
            categorical_features,
        )

    if models_config["hist_gradient_boosting"]["enabled"]:
        hgb_config = models_config["hist_gradient_boosting"]
        registry["hist_gradient_boosting"] = build_tree_pipeline(
            HistGradientBoostingClassifier(
                learning_rate=hgb_config["learning_rate"],
                max_iter=hgb_config["max_iter"],
                max_depth=hgb_config["max_depth"],
                min_samples_leaf=hgb_config["min_samples_leaf"],
                l2_regularization=hgb_config["l2_regularization"],
                random_state=random_state,
            ),
            numeric_features,
            categorical_features,
        )

    return registry


def main() -> None:
    args = parse_args()
    config, config_path = load_config(args.config)
    paths = build_paths(config)
    ensure_workspace_directories(paths)
    dataset, schema = load_inputs(paths)

    numeric_features = schema["numeric_feature_columns"]
    categorical_features = schema["categorical_feature_columns"]

    registry = build_model_registry(config, numeric_features, categorical_features)
    selected_models = args.models or list(registry.keys())
    missing_models = [name for name in selected_models if name not in registry]
    if missing_models:
        raise KeyError(f"Unknown or disabled models requested: {missing_models}")

    train_df = dataset.loc[dataset["split"] == "train"].copy()
    x_train = prepare_model_inputs(train_df, numeric_features, categorical_features)
    y_train = train_df["correct"].astype(int)

    if args.dry_run:
        print(
            "Dry run OK: "
            f"rows={len(dataset)}, train_rows={len(train_df)}, models={', '.join(selected_models)}"
        )
        return

    run_id = args.run_id or pd.Timestamp.now(tz="UTC").strftime("%Y%m%d_%H%M%S")
    run_dir = paths["artifacts_dir"] / "training_runs" / run_id
    models_dir = run_dir / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    run_metadata = {
        "generated_at_utc": utc_now_iso(),
        "run_id": run_id,
        "config_path": str(config_path),
        "processed_dataset_path": str(paths["processed_dataset"]),
        "feature_schema_path": str(paths["feature_schema"]),
        "split_metadata_path": str(paths["split_metadata"]),
        "train_rows": int(len(train_df)),
        "train_positive_rate": float(y_train.mean()),
        "models": selected_models,
    }
    model_training_rows: list[dict[str, Any]] = []

    for model_name in selected_models:
        model = registry[model_name]
        started = time.perf_counter()
        model.fit(x_train, y_train)
        fit_seconds = float(time.perf_counter() - started)
        artifact_path = models_dir / f"{model_name}.joblib"
        joblib.dump(model, artifact_path)
        model_training_rows.append(
            {
                "model_name": model_name,
                "artifact_path": str(artifact_path),
                "fit_seconds": fit_seconds,
                "estimator_class": model.named_steps["classifier"].__class__.__name__,
            }
        )

    save_json(run_dir / "run_metadata.json", to_native(run_metadata))
    save_json(run_dir / "model_training_summary.json", to_native(model_training_rows))
    print(f"Saved training artifacts to: {run_dir}")


if __name__ == "__main__":
    main()
