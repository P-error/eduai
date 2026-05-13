# Dataset Preparation V1

This document describes the data-preparation layer for EduAI's future six-factor candidate outcome scorer.

The scorer architecture remains:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

No model is trained in this layer.

## Synthetic Data

Synthetic v1 creates schema-valid `training_observation.v1` rows for pipeline validation and first scorer experiments.

It models hidden learner profiles with:

- `base_ability`
- `learning_rate`
- `noise_level`
- hidden effective six-factor config
- noisy declared preferences

The hidden config is called effective config because it represents the generated content configuration that yields stronger outcome in the synthetic world. It is not the same as declared preference, and it is not emitted as a model feature.

Synthetic v1 deliberately includes:

- near-optimal candidates
- static baseline candidates
- random/exploration candidates
- deliberately mismatched candidates

This gives the future scorer varied `candidate_config -> outcome` relationships. It still does not prove real educational effect.

`normalized_learning_gain` is clamped to `0..1` in synthetic v1 to keep the first trainer target simple.

## Open Dataset Adapter

Open educational datasets can usually provide learner-state evidence:

- user/student id
- skill/topic id
- attempt history
- correctness history
- timestamps

They often do not provide EduAI's six delivered personalization factors.

Therefore open-dataset observations are not direct evidence that a specific six-factor content configuration caused learning gain unless an observed `delivered_config` exists in the source or in a defensible adapter contract.

When a candidate is assigned synthetically for compatibility, the row can help test the data pipeline or calibrate success prediction, but it must not be described as six-factor causal evidence.

## Real User Adapter

The real-user adapter accepts already normalized dictionaries from future EduAI export code. It does not connect to Prisma or application runtime in this step.

Real-user observations require:

- `source.source_kind = real_user`
- `candidate_config`
- `delivered_config`
- `leakage_guard`
- preserved `policy_context` when available

If `outcome.outcome_available = true`, the row should include `test_event_ref`; otherwise `leakage_guard.notes` must explain why outcome evidence is still acceptable.

## Dataset Manifest

The manifest records:

- dataset identity
- contract and schema versions
- factor-space version
- source kinds
- observation count
- generation config
- file metadata and SHA-256 checksums when files exist
- limitations and notes

## Commands

Generate a sample synthetic dataset:

```bash
python ml/scripts/generate_synthetic_dataset.py \
  --out ml/examples/synthetic_dataset.sample.jsonl \
  --n-learners 20 \
  --n-topics 8 \
  --observations-per-learner 10 \
  --seed 42 \
  --manifest-out ml/examples/dataset_manifest.example.json
```

Validate a dataset:

```bash
python ml/scripts/validate_dataset.py --input ml/examples/synthetic_dataset.sample.jsonl
```

Summarize a dataset:

```bash
python ml/scripts/summarize_dataset.py --input ml/examples/synthetic_dataset.sample.jsonl
```
