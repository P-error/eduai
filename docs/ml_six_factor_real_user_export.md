# Six-Factor Real User Export

## Purpose

The export converts app records with six-factor delivered metadata into `training_observation.v1` JSONL rows with `source_kind=real_user`.

This is a data pipeline for later analysis/retraining. It is not evidence that the current synthetic-trained model improves real educational outcomes.

## Export Command

The project does not require `tsx`. Use the local compile-and-run wrapper:

```bash
bash scripts/export-real-user-training-observations.sh \
  --out exports/real_user_training_observations.sample.jsonl \
  --limit 1000 \
  --include-outcome-missing
```

Dry-run/mock mode does not need a live database:

```bash
bash scripts/export-real-user-training-observations.sh \
  --out exports/real_user_training_observations.sample.jsonl \
  --dry-run \
  --include-outcome-missing
```

For controlled smoke records, restrict the export by dataset origin prefix:

```bash
bash scripts/export-real-user-training-observations.sh \
  --out exports/ml_e2e_smoke_real_user_training_observations.jsonl \
  --limit 1000 \
  --include-outcome-missing \
  --dataset-origin-prefix ml_e2e_smoke_
```

## Validation

Validate exported JSONL with the ML validator:

```bash
ml/.venv/bin/python ml/scripts/validate_dataset.py \
  --input exports/real_user_training_observations.sample.jsonl
```

## Source Mapping

The exporter scans evaluation episodes and joins stored content metadata:

- `EvaluationEpisodeItem.decisionRuntimeJson.sixFactorDeliveredConfig`
- `GeneratedTest.validationMetaJson.sixFactorDeliveredConfig`
- `ChatMessage.signalsJson.sixFactorDeliveredConfig`
- `EvaluationEpisodeItem.outcomeJson`

For learning content, the outcome target is the next generated test outcome in the episode. The previous generated test outcome, when present, is used as `pre_score`.

## Nullable Fields

Some fields can be null in v1:

- `session_ref`
- `content_event_ref`
- `test_event_ref`
- `outcome_observed_at`
- all score fields when outcome is missing
- `model_version`, `backend_kind`, and `policy_id`

Schema-required `subject_ref` and `topic_ref` use safe `unknown_*` placeholders only when the current app record has no source value.

## Limitations

- Existing historical rows without `sixFactorDeliveredConfig` cannot be exported as six-factor real_user observations.
- Live export depends on database availability and stored evaluation/content metadata.
- `next_step_success` is a v1 threshold proxy from observed accuracy.
- Open or synthetic data must not be mixed with this export as if it were real causal evidence.
