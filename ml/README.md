# EduAI ML Layer

This directory contains the research/training layer for EduAI's six-factor pedagogical policy.

It defines and tests the ML-side contracts used by the app-facing runtime policy. The current app can apply a compatible six-factor candidate scorer through the TypeScript runtime path, but synthetic/bootstrap artifacts must not be treated as proof of real educational effect.

## Current Runtime Relationship

The current app-facing policy path is six-factor candidate scoring:

```text
app pre-decision context/features
+ candidate_config
-> predicted outcome
-> selected delivered_config
-> prompt/materialization policy
```

The app-facing decision output contains exactly six factors:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

The runtime can use a compatible JSON linear candidate scorer artifact. The current intended runtime artifact slot is:

```text
artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

The app applies six-factor prompt instructions by default when the runtime path is active and the opt-out flags are not set. If the artifact is missing, invalid, unsupported, or unsafe, the app falls back explicitly and records metadata.

## Why Candidate Scoring

The model is framed as a candidate outcome scorer:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

The policy layer ranks candidate configurations using predicted outcomes such as:

- signed/normalized learning gain proxy;
- next-step success;
- combined outcome score;
- confidence/diagnostics where supported.

This avoids treating the task as six independent label predictions, which would risk copying existing heuristic choices instead of estimating what improves learning.

## Factor Space V1

The v1 candidate configuration has exactly six factors:

- `difficulty`: `easy`, `medium`, `hard`
- `depth`: `brief`, `standard`, `detailed`
- `support_level`: `minimal`, `guided`, `scaffolded`
- `presentation_format`: `paragraph`, `structured_list`, `step_by_step`, `qa`
- `examples_level`: `none`, `single`, `multiple`
- `terminology_level`: `simple`, `balanced`, `technical`

The full grid contains:

```text
3 * 3 * 3 * 4 * 3 * 3 = 972
```

Runtime serving normally uses a bounded candidate set around safe/static/heuristic/current candidates rather than scoring the whole grid.

## Data Sources

`synthetic` data is useful for covering the six-factor candidate space before enough real EduAI observations exist.

`open_dataset` rows can help build learner-state features and calibrate success prediction when the source has enough attempt/outcome history. They must not be described as directly training all six personalization factors unless those factors are actually present or defensibly adapted.

`real_user` EduAI data is required to test the relationship:

```text
delivered_config -> observed outcome
```

The contract keeps `candidate_config` and `delivered_config` separate so offline candidate scoring and real delivery logging can coexist.

## Leakage Rule

`pre_decision_features` may contain only information available before the decision.

Outcome fields are forbidden in features, including:
- `pre_score`
- `post_score`
- `next_step_success`
- `normalized_learning_gain`
- `normalized_learning_gain_clamped`
- `outcome_available`
- hidden labels.

Outcome values belong only under `outcome` and become usable only after delivery and observation.

## Signed Gain Rule

The primary normalized learning-gain target is signed:

```text
normalized_learning_gain in [-1, 1]
```

Negative values are meaningful and represent deterioration after content. They must not be silently clamped to zero for the primary target.

Legacy/nonnegative compatibility can use:

```text
normalized_learning_gain_clamped in [0, 1]
```

That field is not the primary signed target.

## Commands

Install local ML dependencies when needed:

```bash
python -m pip install -e "ml[test]"
```

Validate contracts and examples:

```bash
python ml/scripts/validate_ml_contracts.py
```

Run tests:

```bash
python -m pytest ml/tests
```

Regenerate deterministic example JSON files:

```bash
python ml/scripts/generate_contract_examples.py
```

Generate a synthetic data-preparation sample:

```bash
python ml/scripts/generate_synthetic_dataset.py \
  --out ml/examples/synthetic_dataset.sample.jsonl \
  --n-learners 20 \
  --n-topics 8 \
  --observations-per-learner 10 \
  --seed 42 \
  --manifest-out ml/examples/dataset_manifest.example.json
```

Validate and summarize the generated JSONL:

```bash
python ml/scripts/validate_dataset.py --input ml/examples/synthetic_dataset.sample.jsonl
python ml/scripts/summarize_dataset.py --input ml/examples/synthetic_dataset.sample.jsonl
```

Train a runtime-compatible linear candidate scorer:

```bash
python ml/scripts/train_candidate_scorer.py \
  --input ml/examples/synthetic_dataset.sample.jsonl \
  --artifact-out ml/examples/candidate_scorer_artifact.example.json \
  --eval-out ml/examples/candidate_scorer_eval.example.json \
  --seed 42
```

Evaluate and score candidates:

```bash
python ml/scripts/evaluate_candidate_scorer.py \
  --input ml/examples/synthetic_dataset.sample.jsonl \
  --artifact ml/examples/candidate_scorer_artifact.example.json \
  --eval-out ml/examples/candidate_scorer_eval.example.json

python ml/scripts/score_candidates.py \
  --artifact ml/examples/candidate_scorer_artifact.example.json \
  --observation ml/examples/training_observation.example.json
```

Generate and evaluate synthetic counterfactual ranking data:

```bash
python ml/scripts/generate_synthetic_counterfactual_eval.py \
  --out ml/examples/synthetic_counterfactual_eval.sample.jsonl \
  --n-learners 30 \
  --n-topics 8 \
  --states-per-learner 8 \
  --max-candidates 30 \
  --seed 42

python ml/scripts/evaluate_candidate_ranker.py \
  --artifact ml/examples/candidate_scorer_artifact.example.json \
  --counterfactual-input ml/examples/synthetic_counterfactual_eval.sample.jsonl \
  --eval-out ml/examples/candidate_ranker_eval.example.json
```

Validate app-facing inference compatibility examples:

```bash
python ml/scripts/validate_ml_contracts.py
```

## Runtime Compatibility

The app runtime currently supports compatible JSON linear candidate scorer artifacts.

Runtime-compatible model family:
- `linear_candidate_scorer_v1`
- `linear_candidate_scorer_payload.v1`

Offline tree models may be trained/evaluated in Python, but they are not automatically deployable to the TypeScript runtime. Deploying tree models requires a TypeScript tree scorer/loader or another serving integration.

## Current Honesty State

Implemented now:

- stable six-factor contract;
- JSON Schemas for training observations and model artifacts;
- deterministic candidate grid and bounded candidate generation;
- synthetic data-preparation generator;
- real-user observation/export contract;
- candidate scorer training/evaluation pipeline;
- runtime-compatible linear JSON artifact path;
- app-facing inference compatibility schemas;
- runtime six-factor policy/apply integration in the main app;
- strict LLM-output validation/fallback exclusion on the app side.

Not proven now:

- real-user educational effectiveness;
- causal superiority over baselines;
- final model quality on real EduAI outcome-linked rows;
- semantic correctness of all generated answer keys without live judge/human checks.

The scorer artifact may contain trained JSON weights. If the weights were trained on synthetic observations only, they are valid for runtime compatibility and pipeline testing, but not for real-world educational claims.

## Related Docs

- `docs/PREDICTION_LAYER.md`
- `docs/ml_dataset_contract.md`
- `docs/ml_six_factor_runtime_policy_adapter.md`
- `docs/ml_six_factor_apply_mode.md`
- `ml/contracts/app_inference_compatibility_v1.md`
- `ml/contracts/training_pipeline_v1.md`
- `ml/contracts/dataset_preparation_v1.md`