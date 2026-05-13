# EduAI ML Layer

This directory is a separate research/training layer for EduAI. It does not change the Next.js runtime, Prisma schema, API routes, active policy, LLM generation, or learner-facing logic.

## Why Contract First

The current application is still centered on a narrow operational decision scope, mainly `difficulty` and `depth`, with bridge and heuristic-heavy paths. The dissertation target needs a wider, auditable ML formulation. This step defines the contract for that target without pretending that a trained model already exists.

The future model is framed as a candidate outcome scorer:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

The policy layer can later rank candidate configurations using predicted outcomes such as:

- `expected_learning_gain_proxy`
- `expected_next_step_success`
- confidence or uncertainty when the artifact supports it

This avoids treating the task as six independent label predictions, which would risk copying existing heuristic choices instead of estimating what improves learning.

## Factor Space V1

The v1 candidate configuration has exactly six factors:

- `difficulty`: `easy`, `medium`, `hard`
- `depth`: `brief`, `standard`, `detailed`
- `support_level`: `minimal`, `guided`, `scaffolded`
- `presentation_format`: `paragraph`, `structured_list`, `step_by_step`, `qa`
- `examples_level`: `none`, `single`, `multiple`
- `terminology_level`: `simple`, `balanced`, `technical`

The full grid contains `3 * 3 * 3 * 4 * 3 * 3 = 972` candidate configurations. Runtime serving should normally use a bounded candidate set around a base configuration rather than scoring the whole grid.

## Data Sources

`synthetic` data is needed to cover the full six-factor candidate space before enough real EduAI observations exist.

`open_dataset` rows can help build learner-state features and calibrate success prediction when the source has enough attempt/outcome history. They must not be described as directly training all six personalization factors unless those factors are actually present or defensibly adapted.

`real_user` EduAI data is needed to test the relationship:

```text
delivered_config -> observed outcome
```

The contract keeps `candidate_config` and `delivered_config` separate so offline candidate scoring and real delivery logging can coexist.

## Leakage Rule

`pre_decision_features` may contain only information available before the decision. Outcome fields such as `post_score`, `next_step_success`, and `normalized_learning_gain` are stored only under `outcome` and must not be used as model features.

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

Train the first technical candidate scorer:

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

The app compatibility layer is documented in:

- `ml/contracts/app_inference_compatibility_v1.md`
- `ml/schemas/app_inference_features.v1.schema.json`
- `ml/schemas/app_six_factor_decision.v1.schema.json`

It defines the future app-facing boundary:

```text
app context/features -> ML policy adapter -> six-factor config -> render/prompt policy
```

The production app is not switched to this policy by default.

## Current Honesty State

Implemented now:

- stable six-factor contract;
- JSON Schemas for training observations and future model artifacts;
- deterministic candidate grid and bounded candidate generation;
- example rows and schema validation;
- synthetic data-preparation generator;
- generic open-dataset adapter interface;
- real-user observation normalizer for future EduAI exports;
- dataset manifest and dataset summary utilities;
- first JSON-artifact candidate scorer training/evaluation pipeline;
- synthetic counterfactual ranking diagnostics;
- class-balance diagnostics for `expected_next_step_success`.
- app-facing inference compatibility schemas and safe six-factor fallback/render-mapping helpers.

Not implemented now:

- no production runtime integration;
- no downloaded datasets;
- no real-user six-factor delivered-config logging yet.

The scorer artifact may contain trained JSON weights when produced by `train_candidate_scorer.py`. These weights are trained on synthetic observations only and must not be treated as real-world educational evidence.

Counterfactual ranking files are also synthetic-only. They are useful for checking whether the scorer recovers the synthetic outcome function, but they do not prove real educational effect.
