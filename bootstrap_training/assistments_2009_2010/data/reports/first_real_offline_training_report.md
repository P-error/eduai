# First Real Offline Training Report

## Preflight Review

- Task framing is correct for this workspace.
- Current workspace state was sufficient for a first real offline train/eval run after a small pipeline fix for `pandas.NA` handling in categorical features.
- This external dataset supports training an outcome/correctness model on `correct` as a next-step success proxy.
- This external dataset does **not** directly train final EduAI-native personalization targets such as `difficulty` or `depth`.
- This dataset does **not** provide direct supervised labels for `depth`, `style`, `tone`, `format`, or final optimal-content policy learning.
- The chronological split is leakage-safe but uses `order_id`, not a reliable wall-clock timestamp.
- The same learner can appear in later splits, so this is not a cold-start learner benchmark.
- There is clear label-distribution shift across splits, so test metrics should be interpreted as temporal generalization under drift.

## What Was Actually Trained

- Target: `correct`
- Honest meaning: external bootstrap next-step correctness / outcome model
- Trained model families:
  - `LogisticRegression`
  - `RandomForestClassifier`
  - `HistGradientBoostingClassifier`

This run does **not** directly train:

- `difficulty`
- `depth`
- `style`
- `tone`
- final EduAI-native personalized content policy

`difficulty` may later be chosen by policy over predicted outcomes, but that policy is **not** what was trained here.

## Run Info

- Training run id: `20260327_033935`
- Run directory: `data/artifacts/training_runs/20260327_033935/`
- Train rows: `242801`
- Validation rows: `52029`
- Test rows: `52030`

Training durations:

- `LogisticRegression`: `214.224s`
- `RandomForestClassifier`: `73.944s`
- `HistGradientBoostingClassifier`: `8.084s`

## Comparison Summary

Winner selection policy:

- primary criterion: lowest validation `log_loss`
- ordered tie-breakers: `brier_score`, `roc_auc`, `pr_auc`, expected calibration error, `accuracy`

### Validation Metrics

| Model | ROC-AUC | PR-AUC | Log Loss | Brier | Accuracy | ECE |
| --- | --- | --- | --- | --- | --- | --- |
| `hist_gradient_boosting` | `0.786074` | `0.826099` | `0.532153` | `0.178396` | `0.734052` | `0.019433` |
| `random_forest` | `0.783468` | `0.823749` | `0.536678` | `0.179897` | `0.734360` | `0.030097` |
| `logistic_regression` | `0.756835` | `0.803679` | `0.671749` | `0.193858` | `0.714025` | `0.027794` |

### Test Metrics

| Model | ROC-AUC | PR-AUC | Log Loss | Brier | Accuracy | ECE |
| --- | --- | --- | --- | --- | --- | --- |
| `hist_gradient_boosting` | `0.692130` | `0.828579` | `0.559733` | `0.188586` | `0.721661` | `0.024963` |
| `logistic_regression` | `0.690838` | `0.822323` | `0.562216` | `0.189332` | `0.721295` | `0.027511` |
| `random_forest` | `0.682720` | `0.819913` | `0.562971` | `0.189780` | `0.722064` | `0.016215` |

## Winner

- Bootstrap winner: `HistGradientBoostingClassifier`
- Why it won:
  - best validation `log_loss`
  - best validation `brier_score`
  - best validation `roc_auc`
  - best validation `pr_auc`
  - best validation expected calibration error
  - also best test `roc_auc`, `pr_auc`, `log_loss`, and `brier_score`

Trade-offs:

- `RandomForestClassifier` had slightly higher raw accuracy on both validation and test.
- `RandomForestClassifier` also had lower test ECE than the winner.
- Despite that, `HistGradientBoostingClassifier` was the strongest probability-quality model overall, which is the more appropriate criterion for an outcome model that may later feed policy logic.

## Calibration Post-Check

- Winner validation ECE: `0.019433`
- Winner test ECE: `0.024963`
- Interpretation: acceptable for a bootstrap baseline
- Recommendation: a separate calibration pass is not mandatory immediately, but should be evaluated before any runtime-facing use or downstream policy layer

## Problems Encountered

- First train attempt failed because `pandas.NA` values in categorical features were passed directly into sklearn preprocessing.
- The workspace was fixed by normalizing model inputs before `fit` and `predict_proba`.
- `LogisticRegression` completed training but emitted a convergence warning at the current `max_iter=1200`.
- This warning does not invalidate the run, but it means the linear baseline should be interpreted as useful-yet-not-fully-optimized.

## Saved Artifacts

- trained models:
  - `data/artifacts/training_runs/20260327_033935/models/logistic_regression.joblib`
  - `data/artifacts/training_runs/20260327_033935/models/random_forest.joblib`
  - `data/artifacts/training_runs/20260327_033935/models/hist_gradient_boosting.joblib`
- training metadata:
  - `data/artifacts/training_runs/20260327_033935/run_metadata.json`
  - `data/artifacts/training_runs/20260327_033935/model_training_summary.json`
- evaluation outputs:
  - `data/artifacts/training_runs/20260327_033935/evaluation_summary.json`
  - `data/artifacts/training_runs/20260327_033935/evaluation_summary.md`
  - `data/artifacts/training_runs/20260327_033935/comparison_summary.json`
  - `data/artifacts/training_runs/20260327_033935/comparison_summary.md`
- per-model evaluation outputs and calibration tables:
  - `data/artifacts/training_runs/20260327_033935/evaluation/`
- linked dataset metadata:
  - `data/processed/feature_schema.json`
  - `data/processed/split_metadata.json`

## Recommendation For The Next Step

- Main bootstrap candidate: `HistGradientBoostingClassifier`
- Separate calibration pass: optional next step, but worth testing before any runtime contract or policy coupling
- Later runtime adaptation: yes, a separate artifact-export adaptation layer will still be needed before any EduAI integration
- Key limitations before any future integration:
  - this is an external-data bootstrap outcome model only
  - this is not a final EduAI-native personalization model
  - this does not directly learn `difficulty` or `depth`
  - this does not learn `style`, `tone`, or similar rendering-layer parameters
