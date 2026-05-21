# Architecture

EduAI is a Next.js App Router system with Prisma/PostgreSQL, JWT auth, and an OpenAI-compatible LLM provider.

This document describes the current architectural framing. `VISION.md` describes target-state direction and must not be read as a full current-runtime claim by itself.

## Research boundary

EduAI is not generic UI personalization. The core research problem is prediction and selection of educational content that is useful for an individual learner.

Key distinction:

- declared preference: what the learner says they prefer;
- inferred preference: what the system estimates from behavior and performance;
- effective preference: what actually produces the best measurable learning result.

Current conceptual definition:

- optimal educational content = content that maximizes learning gain;
- first practical proxy = next-task success probability;
- time is secondary and may be used as a constraint or support metric.

## Current high-level architecture

The repository currently has three important layers:

1. Operational app layer
   - learner UI: Learn, Practice, Profile, Analytics, Topics/Subjects;
   - admin UI: observability, prediction metrics, data quality, evaluation/export tooling;
   - API layer: `src/app/api/**/route.ts`;
   - persistence: Prisma/PostgreSQL;
   - LLM access: `src/lib/llm/provider.ts`.

2. Prediction/evaluation layer
   - prediction runtime modules in `src/lib/prediction*.ts`;
   - active policy config in `configs/active_policy.json`;
   - evaluation episodes and item-level protocol metadata;
   - replay-safe logging for predicted and actual outcomes.

3. Pedagogical selection/rendering layer
   - two-factor compatibility surfaces still exist in older route shapes and storage fields;
   - current six-factor decision contract lives in `src/lib/ml-six-factor-policy-contract.ts`;
   - selected pedagogical/rendering factors are materialized into learner-facing LLM prompt constraints by `src/lib/ml-six-factor-apply.ts`.

## Two active ML-related contours

### 1. Prediction accuracy runtime

Configured by:

- `configs/active_policy.json`;
- `configs/ml_accuracy_logreg_artifact.dev.json`;
- prediction-runtime modules under `src/lib/`.

Current state:

- active backend kind is `artifact_ml`;
- current tracked artifact predicts `expected_accuracy`;
- current tracked artifact is synthetic/dev;
- this path supports runtime wiring, provenance, readiness diagnostics, and demo behavior;
- it is not real-user efficacy proof.

### 2. Six-factor pedagogical runtime

Implemented by:

- `src/lib/ml-six-factor-policy-contract.ts`;
- `src/lib/ml-six-factor-artifact-loader.ts`;
- `src/lib/ml-six-factor-candidate-generator.ts`;
- `src/lib/ml-six-factor-policy-adapter.ts`;
- `src/lib/ml-six-factor-apply.ts`;
- `src/lib/ml-six-factor-shadow.ts`;
- `src/lib/ml-six-factor-delivered-config.ts`.

Default artifact path:

```txt
artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

Current six factors:

- `difficulty`;
- `depth`;
- `support_level`;
- `presentation_format`;
- `examples_level`;
- `terminology_level`.

Applied learner-facing paths:

- `src/app/api/chat/route.ts`;
- `src/lib/learning-content-generation.ts`;
- `src/lib/test-generation.ts`;
- `src/lib/learning-dialogue.ts`.

This means the six-factor scorer/apply path is integrated into runtime. It is not merely a disconnected research artifact. The limitation is not integration; the limitation is evidence quality. The current artifact is synthetic/bootstrap and must not be presented as proof of real learning improvement.

## Runtime flags

Relevant flags:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_APPLY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1
```

Behavior:

- disabling `EDUAI_SIX_FACTOR_ML_POLICY` turns scorer selection off and uses the fallback/heuristic path;
- disabling `EDUAI_SIX_FACTOR_APPLY` prevents learner-facing prompt application;
- enabling `EDUAI_SIX_FACTOR_SHADOW_ONLY` records decisions without applying them to learner-facing prompts;
- `NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1` controls the visible learner-facing personalization card.

## Current evaluation flow

1. The learner starts from Learn or Practice.
2. The app stores replay-safe behavioral and performance signals.
3. The prediction layer builds features only from information available before the current decision point.
4. The prediction accuracy runtime may estimate expected next-task accuracy.
5. The six-factor runtime may select a candidate pedagogical configuration.
6. The rendering/apply layer converts the selected six factors into prompt constraints for learner-facing generation.
7. Generated artifacts and submitted attempts store provenance, warnings, fallback state, and delivered configuration metadata where supported.
8. Tests remain the primary learning-evaluation signal. Chat is supporting evidence, not the main outcome signal.
9. Training/export paths keep synthetic and real phases separate.

## Operational readiness

`/api/ready` checks DB, Prisma contract, auth config, rate limiter, prediction runtime, artifact slots, six-factor artifact state, and LLM config.

Warnings may still allow HTTP 200. That means the app can run in the current mode. It does not mean the current artifact set is production-grade or that real-user learning improvement has been proven.

## Architectural invariants

- No future leakage.
- No hidden fallbacks.
- UI must not contain core prediction logic.
- Prediction policies and artifacts must be versioned and comparable.
- Backtesting and calibration must use replay-safe historical data only.
- Heuristic or rule-based layers may exist as baselines, fallbacks, or rendering logic, but must not be described as ML.
- Synthetic/dev artifacts must be labeled as synthetic/dev.
- Answer keys remain server-side; client payloads stay sanitized.

## Known legacy wording

Older documents and some compatibility types may still mention only `difficulty + depth`. Treat that as the early bridge surface, not as the complete current architecture.

Older references to `artifacts/runtime/eduai_native_pedagogy/current/` are historical or future-slot references unless confirmed by current code. The current six-factor scorer default path is the THU scorer path shown above.