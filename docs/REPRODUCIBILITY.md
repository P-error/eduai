# Reproducibility

## Clean Setup

1. Node/npm install:

```bash
npm install
```

2. Configure env vars:
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional)
- `CHAT_STORE_RAW_CONTENT` (optional)

3. Prisma reset + client:

```bash
npx prisma generate
npx prisma migrate reset --force
```

4. Start app:

```bash
npm run dev
```

## Defense Demo Scenario (Recommended)

1. Login as user A via `/login`.
2. Create a subject in `/subjects`.
3. Open `/practice`, run one test in `Standard` mode.
4. Submit attempt with full telemetry (from UI runner).
5. Run second test in `Personalized` mode, submit.
6. Open `/profile` and `/insights` to show:
- confidence/sample-size behavior,
- expected vs actual trend,
- next difficulty suggestion logic.
7. Open `/learn`, send 2-3 turns in both modes.
8. Login as admin (`@eduai.com`) and inspect `/admin/*` pages.

## Fallback vs LLM Modes

### With LLM
- Keep valid `OPENAI_API_KEY` and provider URL.
- Observe generation/tagging source as `llm` in DB metadata.

### Fallback-oriented test
- Intentionally break provider config (e.g., invalid key) in local run.
- Generate test and confirm `generationSource=fallback`, `learningEligible=false`.

## Artifacts To Save For Defense

- screenshots of Learn/Practice/Profile/Insights/Admin pages,
- DB examples of:
  - `GeneratedTest.validationMetaJson`
  - `TestAttempt.byTagJson._meta.prediction`
  - gating skip reasons,
- sample API responses from:
  - `/api/users/me/profile`
  - `/api/users/me/predictions`
  - `/api/admin/prediction-metrics`.

## Practical Notes

- Prototype uses bounded windows/caps in analytics; report the selected `window` filters during demo.
- If DB is unavailable, Prisma commands fail (e.g., `P1001`); this is environment-level, not app logic.
- Deterministic backtest self-check command:
  - `npm run backtest:self-check`
  - validates replay order (`history < current attempt`) on a synthetic 3-attempt dataset with hand-checked MAE.
- Deterministic calibration self-check command:
  - `npm run calibration:self-check`
  - validates deterministic candidate ranking and holdout evaluation on a synthetic dataset.
- Deterministic dataset export self-check command:
  - `npm run dataset-export:self-check`
  - validates consent filtering and no-future-leakage feature construction.
- Deterministic rate-limit self-check command:
  - `npm run rate-limit:self-check`
  - validates 429-style limiter behavior (`retryAfterSeconds` present on second hit).
- Optional calibrated params file:
  - `configs/calibrated_params.json`
  - when absent, predictors use built-in defaults.
- Active prediction policy config:
  - `configs/active_policy.json`
  - controls which prediction policy is used in `/api/users/me/predictions` and submit-time logging.
- Prediction reproducibility depends on fixed constants:
  - duration baseline: `BASELINE_QUESTION_COUNT=5` with `EXPECTED_TIME_MS` scaling,
  - unified duration predictor: `v3_duration_unified_2026_02` with blend `evidenceWeight=clamp(totalQuestions/durationFullEvidenceQuestions)`,
  - accuracy smoothing: Beta prior `a,b` from active params (default `1,1`), history window `N=10`,
  - difficulty adjust magnitude from active params (default `0.07`),
  - confidence for accuracy uses question evidence: `clamp(totalQuestionsSum / 100)`.
