# Reproducibility

This document is about reproducible setup, demo, and evaluation.
It should be read together with `README.md`, `docs/LOCAL_DEV.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md`, and `docs/PREDICTION_LAYER.md`.

Reproducibility requirements for EduAI:

- declared preference and effective preference must remain distinguishable in analysis;
- prediction policies must be versioned and comparable;
- no future leakage;
- no hidden fallbacks;
- heuristics and stubs must stay explicitly labeled;
- synthetic/dev artifacts must not be presented as real-user efficacy evidence;
- time may be logged and evaluated, but it is not the primary learning objective.

## Clean setup

Preferred local setup:

```bash
npm ci
cp .env.example .env.local
npm run dev:local
```

Required env values:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- optional `OPENAI_BASE_URL`
- recommended `DATASET_EXPORT_SECRET`
- optional `CHAT_STORE_RAW_CONTENT`

Useful six-factor env values are already documented in `.env.example`:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_APPLY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1
```

Avoid `npx prisma migrate reset --force` as the default reproducibility path. Use it only when intentionally destroying and reseeding a local database.

## Operational checks

Recommended checks:

```bash
npm run lint
npm run build
npx prisma validate
npm run auth:self-check
npm run learner-flow-contract:self-check
npm run learning-episode:self-check
npm run ml-six-factor:self-check
npm run prediction-runtime:dev-self-check
npm run pilot-readiness:smoke
```

Strict production ML-first gate:

```bash
npm run prediction-runtime:self-check
```

With the tracked synthetic DEV accuracy artifact, the strict production gate is expected to fail. That failure is correct because synthetic/dev artifacts are not production evidence.

## Defense demo scenario

1. Login or register a normal learner through `/login` or `/register`.
2. Create a subject and sections/topics through the normal learner structure.
3. Open `/learn` and run an episode-first learning loop.
4. Complete precheck, learning content/dialogue, and postcheck/holdout steps where available.
5. Open `/practice`, generate and submit a test with telemetry.
6. Open `/profile` and `/analytics` to show declared/effective preference framing, confidence/sample-size behavior, prediction/runtime status, limitations, and next-step support.
7. If `NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1`, inspect the learner-facing six-factor personalization card where present.
8. Login as an admin user and inspect `/admin/*` pages.

Admin access depends on stored `user.isAdmin=true`, not on email domain.

The demo must not claim that current synthetic/dev artifacts prove real learning improvement.

## Scripted showcase route

- `/demo` is an isolated simulated showcase, not an alternate learner runtime path.
- Access is by direct URL only; the main learner navigation does not expose it.
- The main-app language toggle does not drive `/demo`; demo copy remains isolated for showcase stability.
- Main-app visual preferences from Profile are kept out of the demo scope unless demo styling is changed explicitly.
- The route uses fixed scripted data and a deterministic scene sequence.
- It does not require a real learner session.
- It does not make live LLM calls, model/artifact calls, or database writes.
- It is suitable for a short thesis narrative about declared preferences, evidence accumulation, and effective setting adaptation.
- It must not be presented as if the learner actually completed the full visible sequence in real time during the demo route itself.

## Reproducible evaluation framing

When reporting or defending results, keep these comparisons explicit:

- declared-preference comparison;
- heuristic comparison policy;
- stub-model slot, if used for contract validation;
- artifact-backed DEV path, if used for wiring/provenance validation;
- runtime-eligible artifact-backed path, if present and valid.

For all comparisons:

- record active policy id from `configs/active_policy.json`;
- record backend kind and artifact state;
- record six-factor policy metadata where available;
- record dataset/export version or source;
- keep replay order strict: history before current attempt only.

## Current artifact interpretation

Prediction accuracy runtime:

- current tracked policy selects `artifact_ml`;
- current tracked artifact is `configs/ml_accuracy_logreg_artifact.dev.json`;
- it predicts `expected_accuracy`;
- source is synthetic/dev;
- it is not real-user efficacy evidence.

Six-factor runtime:

- current default scorer path is `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`;
- it selects `difficulty`, `depth`, `support_level`, `presentation_format`, `examples_level`, and `terminology_level`;
- it can affect learner-facing prompts when apply mode is enabled;
- current provenance is synthetic/bootstrap.

`/api/ready` may return OK with warnings. That means the app can run in the current mode. It does not mean the artifact set is production-grade evidence.

## LLM and fallback modes

### With LLM

- Keep valid `OPENAI_API_KEY` and provider URL.
- Observe generation/tagging source as `llm` in DB metadata where applicable.

### Fallback-oriented test

- Intentionally break provider config in a local run.
- Generate test and confirm fallback/gating metadata.

This demonstrates fallback behavior only. It must not be described as ML personalization.

## Artifacts to save for defense

- screenshots of Profile/Learn/Practice/Analytics/Topics/Admin pages;
- DB examples of declared/effective preference state where available;
- `GeneratedTest.validationMetaJson` examples;
- `TestAttempt.byTagJson._meta.prediction` examples;
- six-factor shadow/delivered-config metadata where available;
- gating skip reasons;
- sample API responses from `/api/users/me/profile`, `/api/users/me/predictions`, `/api/admin/prediction-metrics`, `/api/ready`;
- active policy snapshot from `configs/active_policy.json`;
- artifact metadata if an ML artifact was used.

## Deterministic checks and scripts

- `npm run backtest:self-check` - replay-order backtest check.
- `npm run calibration:self-check` - deterministic candidate ranking and holdout evaluation check.
- `npm run dataset-export:self-check` - consent filtering, no-future-leakage feature construction, and runtime normalization check.
- `npm run ml-accuracy:self-check` - offline train/eval flow on a synthetic fixture.
- `npm run ml-six-factor:self-check` - six-factor policy/runtime contract check.
- `npm run rate-limit:self-check` - limiter behavior check.

## Fixed reproducibility anchors

- duration expectations remain explicit and versioned in code;
- accuracy smoothing and heuristic parameters remain versioned and inspectable;
- runtime feature payload version remains explicit;
- artifact-backed ML uses only replay-safe features derived from prior evidence;
- six-factor candidate scoring combines pre-decision learner/context features with candidate configs;
- future real-user claims must preserve replay, versioning, and audit guarantees.