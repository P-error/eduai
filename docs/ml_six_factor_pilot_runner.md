# Six-Factor Pilot Runner

The pilot runner creates controlled local records for the full six-factor data loop:

`controlled pilot session -> six-factor ML/apply -> delivered_config logging -> linked outcome -> real_user export -> JSONL validation`

It is for accumulating technically valid `real_user`-format observations in a dev/local database. It is not evidence of educational effect.

## Mock Pilot

```bash
bash scripts/run-six-factor-pilot-session.sh \
  --sessions 10 \
  --mock-content \
  --out exports/pilot_real_user_training_observations.jsonl \
  --seed 42
```

`--mock-content` does not call an external LLM/API. It still uses the same six-factor decision, apply metadata, delivered_config logging, outcome linking, export, and validation path.

## Live Content Mode

```bash
bash scripts/run-six-factor-pilot-session.sh --live-content
```

Live content mode is intentionally not implemented in this runner yet. Use `--mock-content` until a separate safe route-level pilot path is added.

## CLI Options

- `--sessions <number>`: number of controlled sessions, default `10`.
- `--user-prefix <string>`: controlled user prefix, default `ml_pilot_user`.
- `--subject <string>`: subject title, default `ML Pilot Subject`.
- `--topic <string>`: topic label, default `ML Pilot Topic`.
- `--out <path>`: export path, default `exports/pilot_real_user_training_observations.jsonl`.
- `--artifact <path>`: six-factor JSON artifact path, default `ml/examples/candidate_scorer_artifact.example.json`.
- `--mock-content`: deterministic no-LLM pilot mode.
- `--live-content`: reserved; currently returns a clear not-implemented error.
- `--include-outcome-missing`: pass through to export.
- `--cleanup`: remove controlled DB records after export. Default is false so pilot rows remain available for inspection/re-export.
- `--seed <number>`: deterministic mock outcome seed, default `42`.

## Local Flags

The runner sets these only inside its own process:

- `EDUAI_SIX_FACTOR_SHADOW=1`
- `EDUAI_SIX_FACTOR_ML_POLICY=1`
- `EDUAI_SIX_FACTOR_APPLY=1`
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH=<artifact>`

It does not update `.env`, `.env.local`, `configs/active_policy.json`, UI, Prisma schema, or migrations.

## Export And Validation

The runner automatically calls:

```bash
bash scripts/export-real-user-training-observations.sh \
  --out <out> \
  --dataset-origin-prefix <pilot_run_prefix>
```

Then it validates:

```bash
ml/.venv/bin/python ml/scripts/validate_dataset.py --input <out>
```

The JSONL rows use `source_kind=real_user` because they exercise the app-side logging/export contract. In `--mock-content` mode they are controlled mock pilot rows, not real learner-effect evidence.

## When To Retrain

Do not retrain from a tiny pilot file. A useful first retraining/evaluation smoke should wait until the export has enough linked observations to make train/validation/test splits meaningful and to inspect class balance.
