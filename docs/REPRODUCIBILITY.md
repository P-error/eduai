# Reproducibility

This document is about reproducible setup, demo, and evaluation.
It should be read together with `VISION.md`, `docs/ARCHITECTURE.md`, and `docs/PREDICTION_LAYER.md`.

Reproducibility requirements for EduAI:
- declared preference and effective preference must remain distinguishable in analysis;
- prediction policies must be versioned and comparable;
- no future leakage;
- no hidden fallbacks;
- heuristics and stubs must stay explicitly labeled;
- time may be logged and evaluated, but it is not the primary learning objective.

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
2. Create a topic in `/topics`.
3. Inspect the learner preference surfaces and note declared preferences if present.
4. Open `/practice`, run one test in `Standard` mode.
5. Submit attempt with full telemetry (from UI runner).
6. Run a second test in `Personalized` mode, submit.
7. Open `/profile` and `/analytics` to show:
- declared vs effective preference framing;
- browser-persisted visual preferences (`theme`, `font size`, `high contrast`) under `Appearance & accessibility`;
- confidence/sample-size behavior;
- prediction/runtime status and limitations;
- next-step pedagogical decision support.
8. Open `/learn`, send 2-3 turns in both modes.
9. Login as admin (`@eduai.com`) and inspect `/admin/*` pages.

The demo should not claim that current heuristic or stub behavior is already equivalent to the target ML policy.

## Scripted Showcase Route

- `/demo` is an isolated simulated showcase, not an alternate learner runtime path.
- Access is by direct URL only; the main learner navigation does not expose it.
- The main-app `EN/RU` language toggle does not drive `/demo`; demo copy remains isolated for showcase stability.
- Main-app visual preferences from `Profile` (`theme`, `font size`, `high contrast`) are also kept out of the demo scope unless someone changes demo styling explicitly in a separate pass.
- The route uses fixed scripted data for `Alex Carter` and a deterministic scene sequence.
- It does not require a real learner session.
- It does not make live LLM calls, model/artifact calls, or database writes.
- It is suitable for a short thesis narrative about declared preferences, evidence accumulation, and effective setting adaptation.
- It must not be presented as if the learner actually completed the full visible sequence in real time during the demo route itself.

## Reproducible Evaluation Framing

When reporting or defending results, keep these comparisons explicit:
- declared-preference baseline;
- heuristic baseline policy;
- stub-model slot, if used for contract validation;
- artifact-backed ML policy, if present and valid.

For all comparisons:
- record the active policy id from `configs/active_policy.json`;
- record backend kind and artifact state;
- record dataset/export version or source;
- keep replay order strict: history before current attempt only.

## Fallback vs LLM Modes

### With LLM
- Keep valid `OPENAI_API_KEY` and provider URL.
- Observe generation/tagging source as `llm` in DB metadata.

### Fallback-oriented test
- Intentionally break provider config (e.g., invalid key) in local run.
- Generate test and confirm `generationSource=fallback`, `learningEligible=false`.

This demonstrates fallback behavior only.
It must not be described as ML personalization.

## Artifacts To Save For Defense

- screenshots of Profile/Learn/Practice/Analytics/Topics/Admin pages;
- DB examples of:
  - declared/effective preference state where available;
  - `GeneratedTest.validationMetaJson`;
  - `TestAttempt.byTagJson._meta.prediction`;
  - gating skip reasons;
- sample API responses from:
  - `/api/users/me/profile`
  - `/api/users/me/predictions`
  - `/api/admin/prediction-metrics`;
- active policy snapshot from `configs/active_policy.json`;
- artifact metadata if an ML artifact was used.

## Deterministic Checks And Scripts

Deterministic backtest self-check command:
- `npm run backtest:self-check`
- validates replay order (`history < current attempt`) on a synthetic dataset with hand-checked expectations.

Deterministic calibration self-check command:
- `npm run calibration:self-check`
- validates deterministic candidate ranking and holdout evaluation on a synthetic dataset.

Deterministic dataset export self-check command:
- `npm run dataset-export:self-check`
- validates consent filtering, no-future-leakage feature construction, and runtime normalization of export features.

Deterministic offline ML self-check command:
- `npm run ml-accuracy:self-check`
- validates file-based offline train/eval flow, artifact reload, and heuristic-vs-ML comparison on a synthetic dataset-export fixture.

Deterministic rate-limit self-check command:
- `npm run rate-limit:self-check`
- validates limiter behavior (`retryAfterSeconds` present on second hit).

## Runtime And Artifact Notes

Optional calibrated params file:
- `configs/calibrated_params.json`

Optional offline ML artifact file:
- `configs/ml_accuracy_logreg_artifact.local.json`
- runtime loader states are explicit: `ready`, `missing`, `invalid`
- when absent or invalid, artifact-backed ML runtime does not silently substitute a heuristic accuracy backend

Active prediction policy config:
- `configs/active_policy.json`
- controls runtime policy/backend selection for `/api/users/me/predictions` and submit-time logging

Offline ML train/eval examples:

```bash
EDUAI_ML_DATASET_FILE=/absolute/path/to/dataset.jsonl \
EDUAI_ML_ARTIFACT_PATH=configs/ml_accuracy_logreg_artifact.local.json \
npm run ml-accuracy:train
```

```bash
EDUAI_ML_DATASET_FILE=/absolute/path/to/dataset.jsonl \
EDUAI_ML_ARTIFACT_PATH=configs/ml_accuracy_logreg_artifact.local.json \
npm run ml-accuracy:eval
```

If `EDUAI_ML_DATASET_FILE` is omitted, commands use the DB-backed dataset-export path.
If the selected source does not contain enough eligible labeled rows, train/eval must return an explicit insufficient-data state rather than inventing fallback data.

## Fixed Reproducibility Anchors

- duration baseline uses `EXPECTED_TIME_MS[difficulty].mcq` scaling from the current codebase;
- shared duration predictor version remains explicit;
- accuracy smoothing and heuristic parameters remain versioned and inspectable;
- runtime feature payload version remains explicit;
- artifact-backed ML uses only replay-safe features derived from prior evidence;
- future dissertation ML policies for `difficulty` and `depth` must preserve the same replay, versioning, and audit guarantees.
