# Architecture

EduAI is a Next.js App Router system with Prisma/PostgreSQL, JWT auth, and an OpenAI-compatible LLM provider.
This document describes the current architectural framing used for development.
`VISION.md` remains the target-state direction; repository code plus current docs remain the source of truth for current behavior.

## Research Boundary

The project goal is not generic UI personalization.
The core research problem is prediction of optimal educational content for an individual learner with machine learning.

Key distinction:
- declared preference: what the learner says they prefer;
- effective preference: what actually produces the best measurable learning result.

Current conceptual definition:
- optimal educational content = content that maximizes learning gain;
- first practical baseline proxy = next-task success probability;
- time is secondary and may be used as a constraint or support metric, not as the primary educational objective.

## Two-Layer Architecture

### Layer 1: ML prediction layer

Purpose:
- predict pedagogically meaningful variables that influence learning gain;
- infer effective preferences from behavioral and performance data;
- keep prediction policies versioned, comparable, and replay-safe.

Current dissertation focus:
- `difficulty`;
- `explanation depth`.

Possible future ML axis:
- `instructional_mode`.

Non-goals for the first dissertation version:
- treating `tone`, `style`, or formatting as primary ML targets;
- treating all 10 content axes as equal optimization targets.

### Layer 2: rule-based rendering layer

Purpose:
- translate pedagogical decisions into concrete content presentation;
- map predicted targets into tone, style, format, and other presentation constraints;
- keep this materialization logic explicit and auditable.

Rules in this layer are allowed and expected.
They are not a replacement for the ML prediction layer.

## Current System Modules

Main runtime surfaces:
- learner UI: Profile, Learn, Practice, Analytics, Topics;
- researcher/operator UI: Admin `Research episodes` (`/admin/episodes`) for episode launch + inspection in the current admin user's workspace;
- standalone learner support surface: Test Runner (`/tests/[id]`) kept only as a backward-compatible custom-practice runner;
- admin UI: observability, prediction metrics, data-quality tooling;
- API layer: `src/app/api/**/route.ts`;
- persistence: Prisma/PostgreSQL;
- LLM access: `src/lib/llm/provider.ts`.

Current shell/i18n note:
- the main application UI defaults to English;
- the main shell exposes a manual `EN/RU` toggle and persists the selected locale in an app cookie;
- the main `Profile` surface now also exposes practical visual preferences for `theme` (`System/Light/Dark`), app-level font scaling, and a targeted high-contrast mode;
- those visual preferences are stored as browser cookies and applied only to the main application shell/routes;
- `/demo` remains outside this visual-settings pass;
- locale routing is not used;
- `/demo` remains isolated from the main-app locale toggle behavior.

Current supporting modules include:
- runtime decision/materialization contract in `src/lib/personalization-runtime.ts`;
- recommendation and baseline policy logic in `src/lib/recommendation.ts`;
- statistics and baseline update logic in `src/lib/statistics.ts`;
- prediction runtime modules in `src/lib/prediction*.ts`;
- tagging and content metadata logic in `src/lib/tagger.ts` and `src/lib/llm-tagger.ts`.

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
- the shared runtime decision contract now selects `difficulty` and `depth` as the pedagogical outputs;
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
- the learning-content step is now a first-class episode artifact: EduAI generates a structured explanation/chat-delivery step from the same locked pedagogical decision (`difficulty`, `depth`) and the same rules-layer materialization family used by the surrounding tests;
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
4. A policy evaluates candidate pedagogical decisions and selects `difficulty` plus `depth`, with explicit versioning and backend-state metadata.
5. The rendering layer turns those pedagogical decisions into tone, style, and format constraints.
6. The runtime creates or reuses an evaluation episode, resolves a policy-assignment arm, locks an episode orchestration package, and materializes the next step through a minimal coordinator.
7. Submit-time logging records predicted versus actual outcomes together with evaluation metadata and updates the linked episode item outcome record.
8. The learner-facing `/learn` UI uses the same coordinator endpoints to start, restore, submit, and continue one episode instead of manually stitching together chat and standalone test routes.
9. The coordinator can advance from precheck to learning content and then to postcheck/holdout while keeping tests primary and chat secondary.
10. The operator-facing `/admin/episodes` surface uses the same stored summaries plus current user subject/section context to launch and inspect episodes without duplicating prediction logic in the UI.
11. Offline export can now operate either on attempt-level dataset rows, on episode-level evaluation summaries, or on canonical training snapshots projected from operational episode data.
12. Training snapshot export reads completed episodes from PostgreSQL, keeps synthetic and real phases separate, and writes versioned snapshot directories with schema/metadata/manifest files for later model training.

## Architectural Invariants

- No future leakage.
- No hidden fallbacks.
- UI must not contain core prediction logic.
- Prediction policies must be versioned and comparable.
- Backtesting and calibration must use replay-safe historical data only.
- Heuristic or rule-based layers may exist as baselines, fallbacks, or rendering logic, but must never be described as ML.
- Answer keys remain server-side; client payloads stay sanitized.
