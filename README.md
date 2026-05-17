# EduAI (Thesis Prototype)

EduAI is a thesis-defensible prototype for machine-learning-based prediction of educational content parameters for individual learners. The current research/runtime framing is a six-factor pedagogical decision policy, not the earlier two-parameter `difficulty + depth` prototype.

The project is not a production LMS. It is designed to keep prediction, LLM generation, validation, fallback behavior, provenance, and training/export boundaries explicit and auditable.

Primary documentation:
- `docs/RESEARCH_SPEC.md` - dissertation-facing research framing and honesty constraints.
- `docs/ARCHITECTURE.md` - current system architecture and runtime boundaries.
- `docs/PREDICTION_LAYER.md` - six-factor prediction/runtime policy contract.
- `docs/llm_prompt_strictness_rules.md` - LLM prompt/output rules and validation behavior.
- `docs/INDEX.md` - full documentation map.

## Research framing

Key definitions:
- declared preference = what the learner says they prefer;
- inferred/effective preference = what observed behavior and outcomes suggest works better;
- optimal educational content = content configuration that improves measured learning outcomes;
- current outcome target = signed learning gain and related next-step success signals;
- time/duration = secondary operational signal, not the main educational objective.

Current implemented decision space:
- `difficulty`: `easy | medium | hard`
- `depth`: `brief | standard | detailed`
- `support_level`: `minimal | guided | scaffolded`
- `presentation_format`: `paragraph | structured_list | step_by_step | qa`
- `examples_level`: `none | single | multiple`
- `terminology_level`: `simple | balanced | technical`

The runtime uses a bounded candidate set rather than scoring all 972 possible configurations for every request. The six-factor policy can be artifact-backed; if the artifact is missing, invalid, disabled, or unsafe, fallback behavior is explicit and recorded.

## Current system framing

Core pipeline:

```text
pre-decision learner/context features
+ candidate six-factor config
-> candidate scoring / policy selection
-> delivered six-factor config
-> LLM prompt/materialization
-> validated generated test/content/chat
-> outcome logging and export
```

Current runtime defaults:
- six-factor ML policy is enabled by default when the runtime artifact is available;
- learner-facing six-factor prompt application is enabled by default;
- metadata construction is enabled by default;
- rollback is explicit through opt-out flags such as `EDUAI_SIX_FACTOR_ML_POLICY=0`, `EDUAI_SIX_FACTOR_APPLY=0`, `EDUAI_SIX_FACTOR_SHADOW=0`, or `EDUAI_SIX_FACTOR_SHADOW_ONLY=1`.

Honesty constraints:
- synthetic artifacts verify runtime compatibility; they do not prove real educational effect;
- heuristic/static fallback remains a baseline or safety path, not the ML policy;
- LLM-generated tests/content are not trusted blindly;
- fallback and invalid generated artifacts must be excluded from learning/training updates;
- real effectiveness requires outcome-linked evaluation on eligible real or controlled learner data.

## Core product surface

- `/learn`: active structured learning episode surface.
- `/practice`: standalone practice/custom test surface.
- `/profile`: declared/effective preferences, research consent, and account settings.
- `/analytics` / insights views: learner-facing summaries where available.
- `/admin/*`: operator/research observability, exports, and policy diagnostics.

The main research flow is episode-first:

```text
precheck -> learning_content -> optional dialogue -> postcheck -> optional holdout/delayed recheck
```

Tests remain the primary learning-evaluation signal. Chat/dialogue is secondary support evidence.

## LLM generation and validation

EduAI uses an OpenAI-compatible chat-completions provider through `src/lib/llm/provider.ts`.

Runtime LLM outputs are validated before they are treated as normal learning artifacts:
- JSON outputs use parse/schema validation and repair/retry diagnostics;
- generated tests require strict schema and post-parse validation;
- test `answerIndex` must point to a valid option and is not silently rewritten;
- generated tests may optionally be checked by a semantic LLM judge (`EDUAI_LLM_TEST_JUDGE=1`);
- learning content uses strict `learning_content_card` validation;
- fallback outputs are explicitly marked and excluded from learning.

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
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional; OpenAI-compatible provider)
- `CHAT_STORE_RAW_CONTENT` (optional; `1` enables raw chat storage, default is redacted storage)

Useful six-factor runtime values:
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`
- `EDUAI_LLM_TEST_JUDGE=1` to enable optional semantic judge for generated tests.

3. Start local PostgreSQL:

```bash
npm run db:up
```

4. Apply Prisma migrations:

```bash
npm run prisma:migrate:deploy
```

5. Run the local app:

```bash
npm run dev:local
```

`dev:local` starts the compose PostgreSQL service, applies migrations against the compose-aligned DB URL, then starts Next.js.
Use plain `npm run dev` only when the database is already up and you intentionally want a custom `DATABASE_URL`.

Offline checks:

```bash
npm run lint
npm run build
```

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

Prompt/LLM checks:

```bash
bash scripts/audit-llm-prompts.sh --ml-runtime
bash scripts/check-llm-prompt-compliance.sh --mock-provider --ml-runtime
bash scripts/llm-generation-validation-self-check.sh
```

## Minimal research demo flow

1. Register or login from `/login`.
2. Create a subject and topic/section context.
3. Open `/learn` and start a structured episode.
4. Complete the precheck.
5. Review the generated learning content and optional bounded dialogue.
6. Complete the postcheck.
7. Inspect learner-facing ML personalization metadata if enabled.
8. Inspect `GeneratedTest.validationMetaJson`, episode linkage, and export readiness from admin/operator views.
9. Run strict export/backtest scripts when enough eligible data exists.

Do not present synthetic artifacts, fallback paths, or mock-provider compliance as proof of educational effectiveness.

## Canonical docs

See `docs/INDEX.md` for the current documentation map.
For local setup, see `docs/LOCAL_DEV.md`.
For deployment, see `docs/DEPLOYMENT.md` and `docs/RELEASE_CHECKLIST.md`.
For bootstrapping a new ChatGPT thread with current project context, use `context_seed.md`.