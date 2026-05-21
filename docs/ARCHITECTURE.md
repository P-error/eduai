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

## Current Implementation State

The repository currently contains a mix of:
- heuristic baselines;
- stub model paths;
- artifact-backed ML runtime paths;
- rule-based rendering/materialization logic.

Those paths must be interpreted honestly:
- heuristic and stub components are not ML;
- baseline/runtime support metrics are not a substitute for the dissertation ML target definition;
- if an artifact-backed ML slot is unavailable, the system must report that explicitly rather than hiding a fallback.

Current runtime alignment:
- the current predicted learning episode/chat path uses the six-factor configuration as the primary pedagogical decision (`difficulty`, `depth`, `supportLevel`, `presentationFormat`, `examplesLevel`, `terminologyLevel`);
- `difficulty` and `depth` remain two factors inside that six-factor decision and must not be deleted;
- legacy `{ difficulty, depth }` delivery objects remain as derived compatibility projections for existing routes, storage, and old records;
- tone, explanation style, and response formatting are materialized afterward in an explicit rules layer;
- legacy delivery fields remain only as compatibility adapters for current routes and storage surfaces.

Current decision-boundary step:
- the repository now carries one explicit research-boundary contract in `src/lib/pedagogical-decision-contract.ts`;
- `PedagogicalDecisionV1` is the canonical bridge object for pedagogical delivery ownership, even though current runtime still produces it through adapters over existing heuristic/stub/artifact paths;
- `DecisionProvenanceV1` records whether the current decision boundary was backed by a heuristic, stub, artifact, or unknown source, without pretending that every bridge path is ML;
- `LearnerStateSnapshotV1` is intentionally only a boundary snapshot, not a new full learner model or migration-driven state redesign;
- `DeliveredPedagogicalDecisionV1` binds learner snapshot, decision, provenance, and episode-linkage placeholders so later cleanup/export/serving work can depend on one object instead of scattered shapes;
- this step does not switch the active runtime backend and does not claim that current routes or stored records are fully migrated to the new boundary.

Current evaluation alignment:
- the runtime can group related interactions into an explicit evaluation episode;
- each stored test or chat session can now be linked to the episode, policy arm, pedagogical decision, and topic/concept/skill scope that produced it;
- each linked artifact is also registered in a central `EvaluationEpisodeItem` protocol registry with explicit sequence role (`precheck`, `learning_content`, `postcheck`, `holdout`, `delayed_recheck`), item usage (`training` vs `evaluation` vs chat support), and practice-effect linkage metadata;
- each evaluation episode now also carries an explicit data-collection phase/origin marker so future synthetic and real training data can stay separated without UI/runtime toggles;
- arm assignment is now a runtime contract rather than a loose metadata label: baseline, self-report, predicted, and manual override can be selected and then fixed on the episode;
- a lightweight episode coordinator can now lock one episode-level decision package and advance a structured MVP loop (`precheck -> learning_content -> postcheck/holdout`) instead of relying on manual client-side glue across unrelated endpoints;
- the learning-content step is now a first-class episode artifact: EduAI generates a structured explanation/chat-delivery step from the same locked six-factor pedagogical decision and a compatibility `difficulty/depth` projection used by older surrounding contracts;
- the admin-side operator surface now reuses the same subject APIs plus the same episode coordinator instead of introducing a second control plane: it launches episodes, inspects linkage/provenance/sequence, and marks operational export readiness from the stored episode summary;
- tests remain the primary learning-evaluation signal, while chat is logged only as a secondary supporting signal;
- direct repetition, isomorphic same-family checks, unseen holdouts, and delayed retention checks are now distinguished in the protocol layer instead of only being implied by scattered metadata.

Current training-data alignment:
- PostgreSQL remains the canonical operational store; training workflows do not bypass the app by writing only raw CSV files;
- the main project can now export versioned training snapshots from operational episode data into `training_datasets/synthetic/` and `training_datasets/real/`;
- both phase roots share one fixed training schema contract, so later retraining on real EduAI data does not require a separate ingestion rewrite;
- current snapshot writing uses CSV plus explicit schema/metadata/manifest files, with a documented later conversion path to Parquet;
- a fixed future runtime artifact slot exists under `artifacts/runtime/eduai_native_pedagogy/current/`; this slot may now receive an EduAI-native artifact package, but serving integration remains inactive until a later explicit activation step;
- synthetic bridge artifacts in that slot must be labeled as internal pipeline artifacts, not as real-user validation.

## High-Level Data Flow

1. The learner starts from `Learn`, which is now the active episode-first learner route.
2. The API stores replay-safe behavioral and performance signals.
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
