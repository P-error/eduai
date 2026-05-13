# ASSISTments 2009-2010 Bootstrap Training Workspace

This folder is a fully isolated bootstrap-training workspace for the first real offline training path on an external educational dataset.
It does not modify EduAI runtime, routes, Prisma schema, frontend, or backend behavior.

## Task Validation First

- The task framing is correct for an isolated bootstrap baseline.
- This dataset honestly supports supervised modeling of `correct` as a next-step correctness / success proxy.
- This dataset supports chronological interaction ordering, learner-history aggregates, skill-history aggregates, and opportunity-based features.
- This dataset does not expose a reliable wall-clock event timestamp for split logic; the honest leakage-safe ordering field in this workspace is `order_id`.
- This dataset does **not** provide direct supervised labels for `depth`, `tone`, `style`, `format`, or final `optimal educational content`.
- This dataset does **not** provide a direct supervised `difficulty` label; difficulty can only be approached indirectly later through performance-derived signals, not as a native label in this workspace.
- Therefore this workspace is a bootstrap next-step correctness baseline, not the final EduAI model of optimal personalized content.

## What This Workspace Trains

- Primary target: `correct`
- Honest interpretation: bootstrap next-step correctness / success proxy
- Model family: transparent `scikit-learn` baselines
- Supported baselines:
  - `LogisticRegression`
  - `RandomForestClassifier`
  - `HistGradientBoostingClassifier`

## What This Workspace Does Not Train

- No direct training for `depth`
- No direct training for `style`
- No direct training for `tone`
- No direct training for final optimal-content policy
- No TensorFlow/PyTorch pipeline
- No runtime EduAI integration

## Folder Layout

```text
bootstrap_training/assistments_2009_2010/
├── README.md
├── requirements.txt
├── configs/
│   └── default.json
├── data/
│   ├── raw/
│   ├── interim/
│   ├── processed/
│   ├── artifacts/
│   └── reports/
├── scripts/
│   ├── setup_env.sh
│   ├── download.sh
│   ├── inspect.sh
│   ├── prepare.sh
│   ├── train.sh
│   ├── evaluate.sh
│   └── run_full_pipeline.sh
└── src/
    ├── common.py
    ├── download_dataset.py
    ├── inspect_dataset.py
    ├── prepare_dataset.py
    ├── feature_engineering.py
    ├── train_models.py
    └── evaluate_models.py
```

## Dataset Source

- Source page:
  `https://sites.google.com/site/assistmentsdata/home/2009-2010-assistment-data/skill-builder-data-2009-2010`
- Corrected file page:
  `https://drive.google.com/file/d/1NNXHFRxcArrU0ZJSb9BIL56vmUt5FhlE/view?usp=sharing`
- Direct download URL used by scripts:
  `https://drive.google.com/uc?export=download&id=1NNXHFRxcArrU0ZJSb9BIL56vmUt5FhlE`

The download path uses Python standard-library HTTP handling and stores source metadata, timestamps, filename, and checksum locally in `data/raw/download_metadata.json`.

## Default Modeling Policy

- Default split strategy: global chronological split by interaction order
- Leakage policy: no future interactions may contribute to earlier rows
- Tradeoff: the same learner can appear in later splits, because the goal here is a leakage-safe sequential correctness baseline rather than a cold-start learner benchmark
- Default feature set intentionally avoids same-row `attempt_count`, `hint_count`, `hint_total`, `ms_first_response`, `overlap_time`, and `bottom_hint` as direct model inputs because they are realized during the same interaction and would make the baseline less faithful to pre-attempt next-step prediction
- Historical aggregates from prior rows are allowed and are used

## Environment Setup

```bash
cd bootstrap_training/assistments_2009_2010
./scripts/setup_env.sh
```

If you do not want a local virtual environment, each script can also fall back to `python3`, but the isolated `.venv` is the intended path.

## Commands

Download dataset:

```bash
./scripts/download.sh
```

Inspect schema and save reports:

```bash
./scripts/inspect.sh
```

Prepare normalized dataset and engineered features:

```bash
./scripts/prepare.sh
```

Dry-run training entrypoint without fitting:

```bash
./scripts/train.sh --dry-run
```

Train all enabled baseline models later:

```bash
./scripts/train.sh
```

Dry-run evaluation entrypoint:

```bash
./scripts/evaluate.sh --dry-run
```

Evaluate a completed training run later:

```bash
./scripts/evaluate.sh --run-dir <run-id>
```

Full later orchestration:

```bash
./scripts/run_full_pipeline.sh
```

## Main Outputs

- `data/raw/download_metadata.json`
- `data/reports/dataset_inspection_summary.json`
- `data/reports/dataset_inspection_summary.md`
- `data/reports/task_scope_validation.md`
- `data/reports/first_real_offline_training_report.md`
- `data/interim/assistments_interactions_normalized.parquet`
- `data/interim/prepare_metadata.json`
- `data/processed/assistments_bootstrap_features.parquet`
- `data/processed/feature_schema.json`
- `data/processed/split_metadata.json`
- `data/artifacts/training_runs/<run-id>/...`

## First Real Offline Training Result

- Completed baseline run: `data/artifacts/training_runs/20260327_033935/`
- Bootstrap winner: `HistGradientBoostingClassifier`
- Winner selection policy: lowest validation `log_loss`, with `brier_score`, `roc_auc`, `pr_auc`, calibration error, and `accuracy` as ordered tie-breakers
- Winner validation metrics:
  - ROC-AUC `0.786074`
  - PR-AUC `0.826099`
  - log loss `0.532153`
  - Brier score `0.178396`
  - accuracy `0.734052`
  - ECE `0.019433`
- Winner test metrics:
  - ROC-AUC `0.692130`
  - PR-AUC `0.828579`
  - log loss `0.559733`
  - Brier score `0.188586`
  - accuracy `0.721661`
  - ECE `0.024963`
- Comparison artifacts:
  - `data/artifacts/training_runs/20260327_033935/comparison_summary.json`
  - `data/artifacts/training_runs/20260327_033935/comparison_summary.md`
- Calibration post-check: acceptable for a bootstrap baseline; a separate calibration pass is not mandatory immediately, but should be evaluated before any runtime-facing use
- Important note: `RandomForestClassifier` was slightly better on raw test accuracy and test ECE, but `HistGradientBoostingClassifier` was better on the primary probability-quality metrics used for winner selection
- Important note: `LogisticRegression` trained successfully but emitted a convergence warning at the current `max_iter`; keep it as a transparent baseline, not as the selected bootstrap winner

## Metrics Prepared For Later Evaluation

- ROC-AUC
- PR-AUC
- log loss
- Brier score
- accuracy as a secondary metric
- expected calibration error summary

## Final Honesty Note

This workspace is a bootstrap offline benchmark for external-data next-step correctness prediction.
It is **not** evidence that the final EduAI-native `difficulty + depth` personalization problem is already solved, and it does **not** invent missing labels for `depth`, `style`, or `tone`.
