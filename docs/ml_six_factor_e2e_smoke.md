# Six-Factor ML Loop E2E Smoke

This smoke verifies the local backend loop without enabling six-factor behavior by default:

`artifact/fallback policy -> app decision -> learning-content apply -> delivered_config logging -> outcome linking -> real_user export -> ML validation`

## Flags Used Inside The Smoke

The smoke sets these only inside its own process:

- `EDUAI_SIX_FACTOR_SHADOW=1`
- `EDUAI_SIX_FACTOR_ML_POLICY=1`
- `EDUAI_SIX_FACTOR_APPLY=1`
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`

No app config or `configs/active_policy.json` is changed.

## Run

```bash
bash scripts/ml-six-factor-e2e-smoke.sh
```

Default export path:

```text
exports/ml_e2e_smoke_real_user_training_observations.jsonl
```

Validate the exported JSONL:

```bash
ml/.venv/bin/python ml/scripts/validate_dataset.py \
  --input exports/ml_e2e_smoke_real_user_training_observations.jsonl
```

## What It Checks

- Prisma can connect to the local dev DB and required tables exist.
- Controlled smoke user, subject, episode, learning-content event and postcheck outcome can be created.
- The six-factor decision path can use the runtime JSON artifact and return `decisionSource=ml_policy`.
- `EDUAI_SIX_FACTOR_APPLY=1` produces prompt instructions containing all six ML factors.
- Technical test `response_format` remains `mcq`.
- Canonical metadata contains `sixFactorShadow`, `sixFactorDeliveredConfig`, `candidateConfig`, `deliveredConfig`, and `appliedToLearnerFacingOutput=true`.
- Outcome is linked after the decision timestamp.
- Exported observation has `source_kind=real_user`.
- `pre_decision_features` does not contain outcome fields.
- `leakage_guard.uses_only_pre_decision_data=true`.

## DB Unavailable

If the local DB is down or migrations are not applied, the smoke exits with `DB_UNAVAILABLE` and a short hint. Start the dev DB and apply migrations, then rerun:

```bash
npm run db:up
npm run prisma:migrate:deploy
```

## Cleanup

By default, smoke DB records are cleaned after the JSONL export is written. To keep the controlled records for manual inspection:

```bash
bash scripts/ml-six-factor-e2e-smoke.sh --keep-records
```

All controlled records use a `ml_e2e_smoke_YYYYMMDDTHHMMSS` prefix in `externalId`, `clientKey`, `datasetOrigin`, and metadata.

## Success Criteria

A successful smoke means the backend loop is technically connected on local/dev data. It does not prove educational effectiveness. The current runtime-compatible artifact is bootstrap/synthetic-oriented, so real conclusions still require real-user pilot data, calibration, and retraining.

## Optional Retraining

The smoke intentionally creates a tiny controlled dataset. Training is normally skipped because one observation is not enough for a meaningful train/validation/test split. Once the export contains enough rows:

```bash
ml/.venv/bin/python ml/scripts/train_candidate_scorer.py \
  --input exports/ml_e2e_smoke_real_user_training_observations.jsonl \
  --artifact-out exports/ml_e2e_smoke_candidate_scorer_artifact.json \
  --eval-out exports/ml_e2e_smoke_candidate_scorer_eval.json \
  --seed 42
```
