# EduAI

EduAI is a thesis-defensible prototype for prediction and selection of pedagogically meaningful educational content for individual learners.

The current repository is not a generic LMS and not a proof that every learner-facing decision is already validated by real-user ML evidence. It is an auditable research prototype with explicit runtime provenance, fallback states, evaluation episodes, and dataset/export paths.

## Current runtime state

Read this first when judging the current implementation:

- `docs/INDEX.md` - documentation map and current runtime summary.
- `docs/RESEARCH_SPEC.md` - dissertation/research framing and honesty constraints.
- `VISION.md` - target-state product direction, not a runtime claim.

The current implementation has two separate ML-related runtime contours:

1. **Prediction accuracy runtime**
   - Configured by `configs/active_policy.json`.
   - Current tracked config uses `backend.kind=artifact_ml` with `configs/ml_accuracy_logreg_artifact.dev.json`.
   - That DEV artifact predicts `expected_accuracy` only.
   - It is synthetic/dev evidence, not production ML-first evidence and not real-user learning-effect proof.

2. **Six-factor pedagogical runtime**
   - Implemented in `src/lib/ml-six-factor-*.ts`.
   - Default artifact path: `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`.
   - Selects and applies six pedagogical/rendering factors:
     - `difficulty`
     - `depth`
     - `support_level`
     - `presentation_format`
     - `examples_level`
     - `terminology_level`
   - Applied to learner-facing generation paths when enabled:
     - chat
     - learning content
     - test generation
   - Current artifact provenance is synthetic/bootstrap. It verifies runtime integration and metadata provenance; it does not prove real educational effectiveness.

Older documents may still mention the early two-factor scope (`difficulty` + `depth`). Treat that as the early bridge scope, not as a complete description of the current runtime.

## Research framing

Core distinction:

- declared preference = what the learner says they prefer;
- inferred preference = the system estimate from observed behavior and performance;
- effective preference = what actually yields the best measurable learning result.

Conceptual objective:

- optimal educational content = content that maximizes learning gain;
- first practical proxy = next-task success probability;
- time is a secondary metric or operational constraint, not the main educational objective.

Honesty rules:

- heuristics and stubs are not ML;
- synthetic/dev artifacts are not real-user efficacy evidence;
- no hidden fallbacks;
- no future leakage;
- policy/backend provenance must remain explicit;
- tests and structured episode checks remain the primary learning signal;
- chat is secondary/supporting evidence.

## Core product surface

- Learn: episode-first learning flow with structured checks, learning content, and bounded dialogue.
- Practice: test generation and submission with telemetry.
- Profile: declared/effective preference and personalization state.
- Analytics: progress, prediction status, limitations, and next-step support.
- Topics/Subjects: learner-owned educational structure.
- Admin: observability, data quality, prediction metrics, evaluation/export tooling.

## Quickstart

1. Install dependencies:

```bash
npm ci
```

2. Configure env:

```bash
cp .env.example .env.local
```

Required values:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` optional
- `CHAT_STORE_RAW_CONTENT` optional, default redacted storage
- `DATASET_EXPORT_SECRET` recommended for export pseudonymization

Local/demo six-factor mode is explicit in `.env.example`:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_APPLY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1
```

3. Start local Postgres and app:

```bash
npm run dev:local
```

`dev:local` starts the compose PostgreSQL service, applies `prisma migrate deploy` against the compose-aligned local DB URL, then starts Next.js.
Use plain `npm run dev` only when the database is already up and `DATABASE_URL` intentionally points to the target database.

## Pilot-like local startup

```bash
npm run db:up
npm run prisma:migrate:deploy
npm run build
npm run start
```

Operational checks:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
npm run auth:self-check
npm run pilot-readiness:smoke
```

`/api/ready` is the runtime gate. It checks DB, Prisma contract, auth config, rate limiter, prediction runtime, artifact slots, six-factor artifact state, and LLM config.

## Quality checks

```bash
npm run lint
npm run build
npx prisma validate
```

Useful self-checks:

```bash
npm run auth:self-check
npm run learner-flow-contract:self-check
npm run learning-episode:self-check
npm run ml-six-factor:self-check
npm run prediction-runtime:dev-self-check
npm run pilot-readiness:smoke
```

The strict production ML-first gate is:

```bash
npm run prediction-runtime:self-check
```

With the tracked synthetic DEV accuracy artifact, the strict production gate is expected to fail with a synthetic/dev eligibility blocker. That is intentional.

## Minimal learner flow

1. Register or login from `/register` or `/login`.
2. Create a subject and sections/topics.
3. Use `/learn` for the episode-first loop.
4. Complete precheck -> learning content/dialogue -> postcheck/holdout steps.
5. Use `/practice` for custom/core test generation.
6. Submit tests with telemetry.
7. Inspect `/profile`, `/analytics`, and admin observability pages.

Admin access depends on stored `user.isAdmin=true`, not on email domain.

## Canonical docs

- `docs/INDEX.md` - documentation map and current runtime summary.
- `docs/LOCAL_DEV.md` - local bootstrap and troubleshooting.
- `docs/DEPLOYMENT.md` - GitHub/Vercel deployment flow.
- `docs/API_REFERENCE.md` - endpoint contracts.
- `docs/PREDICTION_LAYER.md` - prediction/runtime honesty rules.
- `docs/ml_six_factor_apply_mode.md` - six-factor apply behavior.
- `docs/ml_six_factor_runtime_policy_adapter.md` - six-factor policy adapter.

For bootstrapping a new ChatGPT thread with full current state, use `context_seed.md` if present and up to date.