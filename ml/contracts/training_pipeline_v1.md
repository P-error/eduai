# Training Pipeline V1

This layer trains the first technical EduAI candidate outcome scorer:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

It is not runtime integration and not proof of real educational effectiveness.

## Model Families

`linear_candidate_scorer_v1` is a small deterministic model implemented with the Python standard library:

- linear regression trained by batch gradient descent for `expected_learning_gain_proxy`;
- logistic regression trained by batch gradient descent for `expected_next_step_success`;
- linear regression trained by batch gradient descent for `combined_outcome_score`.

No pickle or binary artifact is written. Weights are stored as JSON so the artifact remains auditable, portable, and reviewable.

`tree_candidate_scorer_v1` is an offline training/evaluation family backed by scikit-learn tree ensembles:

- random forest;
- extra trees;
- gradient boosting when the optional training dependency is installed.

Tree artifacts are exported as JSON tree structures for reproducibility. They are not automatically enabled in the learner-facing TypeScript runtime. Runtime still serves the existing linear-compatible path unless a dedicated TS tree scorer and production policy switch are added deliberately.

`dummy_candidate_scorer_v1` is a sanity baseline. It is not ML personalization and exists only to expose mean/majority-class comparisons.

## Inputs

Feature extraction uses only:

- `pre_decision_features`;
- `candidate_config`;
- safe `source.source_kind`;
- stable subject/topic hash features.

The feature schema includes learner-state/candidate interaction features so the scorer can learn personalized candidate utility instead of only global factor preferences. Current interaction blocks include correct-rate by difficulty/support, history-count by depth/examples/terminology, and unknown/low/high state indicators by risky factor values.

It does not use:

- `outcome`;
- `post_score`;
- `next_step_success`;
- `normalized_learning_gain`;
- `delivered_config`;
- any post-decision field.

## Targets

Rows are supervised only when `outcome.outcome_available = true`.

Legacy target schema `outcome_targets.v1_clamped_gain` remains available for compatibility:

- `expected_learning_gain_proxy = normalized_learning_gain`, clamped to `0..1`;
- `expected_next_step_success = next_step_success`, normalized to `0/1`;
- `combined_outcome_score = 0.75 * expected_learning_gain_proxy + 0.25 * expected_next_step_success`, clamped to `0..1`.

New signed target schema `outcome_targets.v2_signed_gain` preserves negative learning gain:

- `expected_learning_gain_signed = normalized_learning_gain`, clamped to `-1..1`;
- `expected_learning_gain_proxy` remains the old `0..1` clamped target for compatibility diagnostics;
- `expected_next_step_success = next_step_success`, normalized to `0/1`;
- `combined_outcome_score = 0.75 * ((expected_learning_gain_signed + 1) / 2) + 0.25 * expected_next_step_success`, clamped to `0..1`.

New model comparisons should report both signed gain metrics and old/clamped gain metrics. Negative gain must not be silently removed in v2 training or evaluation.

`outcome_targets.v2_signed_gain` is the default target schema for trainer/evaluator CLI and library calls. `outcome_targets.v1_clamped_gain` is legacy compatibility only.

Rows without available outcome are skipped for training and counted in evaluation reports.

## Split Strategies

The trainer/evaluator supports:

- `observation_id_hash` default deterministic row split;
- `user_id_hash` for user-based holdout;
- `time_ordered` for chronological train/validation/test;
- `topic_id_hash` for topic-based diagnostic holdout.

Evaluation reports include split diagnostics that warn about user/topic overlap across train, validation, and test.

## Policy Selection Risk Diagnostics

Evaluation reports include policy-selection diagnostics in addition to prediction metrics:

- unsafe candidate share before guardrails;
- risky top-candidate share;
- frequency of `hard`, `brief`, `minimal`, `none`, and `technical`;
- factor distribution for raw and guarded top-1 candidates;
- top candidate score and top1/top2 margin diagnostics.

Counterfactual ranking evaluation separately reports top-1 regret, top-3 contains best, and rank correlation when counterfactual candidate labels are available.

## Baselines

The pipeline includes explicit baselines:

- `static_baseline`;
- `random_candidate_baseline`;
- `heuristic_like_baseline`;
- `oracle_upper_bound_for_synthetic`.

The oracle is currently unavailable because the synthetic export does not emit hidden effective config. Baselines are diagnostics, not ML.

## Interpretation Limits

Training on synthetic observations checks whether the scorer architecture, artifact format, and evaluation loop work. It does not prove that the selected candidate is educationally better for real learners.

Open datasets can later help calibrate learner-state and success prediction, but they usually do not contain observed six-factor `delivered_config`.

Real EduAI observations are required for final dissertation claims about `delivered_config -> outcome`.

## Commands

Train:

```bash
python ml/scripts/train_candidate_scorer.py \
  --input ml/examples/synthetic_dataset.sample.jsonl \
  --artifact-out ml/examples/candidate_scorer_artifact.example.json \
  --eval-out ml/examples/candidate_scorer_eval.example.json \
  --seed 42
```

For longitudinal learner holdout, use a user-level split:

```bash
python ml/scripts/train_candidate_scorer.py \
  --input ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl \
  --artifact-out ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json \
  --eval-out ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42_eval.json \
  --seed 42 \
  --split-strategy user_id_hash
```

Evaluate:

```bash
python ml/scripts/evaluate_candidate_scorer.py \
  --input ml/examples/synthetic_dataset.sample.jsonl \
  --artifact ml/examples/candidate_scorer_artifact.example.json \
  --eval-out ml/examples/candidate_scorer_eval.example.json
```

Compare trained scorer metrics against transparent baselines:

```bash
python ml/scripts/compare_candidate_scorer_metrics.py \
  --input ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl \
  --artifact ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json \
  --out ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42_comparison.json \
  --seed 42 \
  --split-strategy user_id_hash
```

Diagnose a THU-style training observation dataset:

```bash
python ml/scripts/diagnose_training_observations.py \
  --input ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl \
  --out-json ml/src/eduai_ml/training/THU/artifacts/reports/thu_training_observation_diagnostics.json \
  --out-md ml/src/eduai_ml/training/THU/artifacts/reports/thu_training_observation_diagnostics.md
```

Train and compare linear, dummy, and tree candidates with signed targets:

```bash
python ml/scripts/train_and_compare_candidate_scorers.py \
  --input ml/src/eduai_ml/training/THU/merged/synthetic_users_001_050_training_observations_v1.jsonl \
  --artifacts-dir ml/src/eduai_ml/training/THU/artifacts \
  --reports-dir ml/src/eduai_ml/training/THU/artifacts/reports \
  --seed 42
```

Score candidates for one observation:

```bash
python ml/scripts/score_candidates.py \
  --artifact ml/examples/candidate_scorer_artifact.example.json \
  --observation ml/examples/training_observation.example.json
```
