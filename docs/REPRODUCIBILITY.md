# Reproducibility

This document describes reproducible setup, demo, prompt/LLM checks, and evaluation evidence for the current six-factor EduAI prototype.

It should be read with:
- `docs/RESEARCH_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/PREDICTION_LAYER.md`
- `docs/llm_prompt_strictness_rules.md`
- `docs/ml_dataset_contract.md`

Reproducibility requirements:
- declared preference and effective preference remain distinguishable;
- six-factor decisions are versioned, logged, and comparable;
- no future leakage;
- no hidden fallbacks;
- fallback/invalid generated artifacts are excluded from learning/training updates;
- synthetic artifacts are not treated as real educational evidence;
- time/duration is secondary, not the primary learning objective.

## Clean Setup

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
- `OPENAI_BASE_URL` (optional)
- `CHAT_STORE_RAW_CONTENT` (optional)

Six-factor runtime artifact path:

```bash
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

Optional generated-test semantic judge:

```bash
EDUAI_LLM_TEST_JUDGE=1
```

3. Start local PostgreSQL and apply migrations:

```bash
npm run db:up
npm run prisma:migrate:deploy
```

4. Start app:

```bash
npm run dev:local
```

Use plain `npm run dev` only when the database is already running and `DATABASE_URL` intentionally points to the desired DB.

## Controlled Pilot-Like Startup

```bash
npm run db:up
npm run prisma:migrate:deploy
npm run build
npm run start
```

Operational signals:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
npm run auth:self-check
npm run pilot-readiness:smoke
```

## Defense Demo Scenario (Recommended)

The recommended demo is episode-first. Do not use the older standalone `Practice -> Profile -> Analytics` path as the main proof narrative.

1. Login or register from `/login`.
2. Create a subject and topic/section context if needed.
3. Open `/learn`.
4. Start a structured learning episode.
5. Complete the `precheck` test.
6. Review generated `learning_content`.
7. Ask one bounded dialogue question if the episode exposes dialogue.
8. Acknowledge learning content and continue.
9. Complete the `postcheck` test.
10. Inspect learner-facing ML personalization metadata when `NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1`.
11. Inspect admin/operator episode metadata and export readiness.
12. Inspect stored metadata examples:
    - six-factor delivered config;
    - `decisionSource`;
    - `fallbackUsed`;
    - `candidateCount`;
    - `appliedToLearnerFacingOutput`;
    - generated-test validation metadata;
    - learning eligibility/exclusion reason;
    - linked pre/post outcomes.

The demo may show that the runtime path, metadata, validation, and episode linkage work. It must not claim real educational effectiveness unless outcome-linked evaluation data is available.

## Prompt And LLM Compliance Checks

Prompt snapshot audit through current six-factor runtime path:

```bash
bash scripts/audit-llm-prompts.sh --ml-runtime
```

Mock-provider compliance:

```bash
bash scripts/check-llm-prompt-compliance.sh --mock-provider --ml-runtime
```

LLM generation validation self-check:

```bash
bash scripts/llm-generation-validation-self-check.sh
```

Live-provider compliance, only when a safe key is available:

```bash
bash scripts/check-llm-prompt-compliance.sh --live-provider --ml-runtime
```

If `OPENAI_API_KEY` is unavailable, live checks should report provider unavailable rather than printing secrets or failing opaquely.

## DB-Backed Evidence Checks

Use a real local PostgreSQL instance for checks that involve submit route, episode linkage, learning gates, or exports.

Important checks:
- generated tests save only after validation or explicit fallback;
- fallback generated tests have `learningEligible=false`;
- corrupt stored answer keys return `TEST_DATA_CORRUPT` rather than silently grading;
- submitted postcheck outcome links back to the episode item;
- strict export can distinguish eligible and skipped rows.

A failed DB-backed check because PostgreSQL is unavailable is an environment failure, not proof the code path is broken.

## Fallback vs LLM Modes

### With LLM
- Use valid `OPENAI_API_KEY` and optional `OPENAI_BASE_URL`.
- Confirm generation source is `llm` or `llm_repaired`.
- Confirm validation metadata is present.
- Confirm fallback is false for normal artifacts.

### Fallback-oriented test
- Intentionally disable or break the provider in a controlled local run.
- Generate content/test and confirm:
  - `generationSource="fallback"`;
  - `learningEligible=false`;
  - fallback/exclusion reason is recorded;
  - the artifact is not treated as ML success.

This demonstrates fallback safety only. It is not evidence of personalization quality.

## Artifacts To Save For Defense

- screenshots of `/learn` episode flow;
- screenshot of safe ML personalization card, if enabled;
- sample `GeneratedTest.validationMetaJson`;
- sample `ChatMessage.signalsJson` for learning content/dialogue;
- sample `TestAttempt.byTagJson._meta`;
- sample episode summary with precheck/postcheck linkage;
- prompt audit output;
- mock and live prompt compliance output, if live key is available;
- strict export dry-run summary;
- model artifact metadata if used;
- final model evaluation/baseline comparison report when available.

## Deterministic Checks And Scripts

Useful checks include:

```bash
npm run lint
npm run build
bash scripts/audit-llm-prompts.sh --ml-runtime
bash scripts/check-llm-prompt-compliance.sh --mock-provider --ml-runtime
bash scripts/llm-generation-validation-self-check.sh
bash scripts/ml-six-factor-shadow-self-check.sh
bash scripts/export-real-user-training-observations.sh --out /tmp/eduai-strict-export-smoke.jsonl --dry-run --strict-episode-outcome-linking
```

Python/ML checks depend on local Python dependencies:

```bash
python -m pip install -e "ml[test]"
PYTHONPATH=ml/src python -m pytest ml/tests
```

If `pytest` is missing, install the ML test dependencies or report the dependency gap explicitly.

## Runtime And Artifact Notes

Current runtime-compatible artifact path:

```text
artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

Runtime currently supports compatible linear JSON candidate scorer artifacts. Offline tree models are not runtime-compatible unless TypeScript serving support is added.

Synthetic/bootstrap artifacts:
- validate the runtime scorer/application path;
- help test contracts and metadata;
- do not prove real learner benefit.

## Fixed Reproducibility Anchors

- six-factor candidate config is the current policy output;
- signed learning gain is the primary normalized target where available;
- LLM-generated artifacts must pass validation or be marked fallback;
- replay-safe features must be built from history before the decision point;
- tests are primary learning signals;
- chat/dialogue is secondary support evidence;
- fallback and generated-invalid artifacts must be excluded from supervised training/effect claims;
- comparisons must name the exact policy/backend/artifact/baseline used.