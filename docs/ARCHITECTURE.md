# Architecture

EduAI is a Next.js App Router system with Prisma/PostgreSQL, JWT auth, and an OpenAI-compatible LLM provider.

This document describes the current implemented architecture after the six-factor ML/apply and LLM-validation hardening work. It should be read with `docs/RESEARCH_SPEC.md`, `docs/PREDICTION_LAYER.md`, and `docs/llm_prompt_strictness_rules.md`.

## Research Boundary

The project goal is not generic UI personalization.

The core research problem is predicting and applying educational content configurations that are likely to improve measured learning outcomes for an individual learner/context state.

Key distinction:
- declared preference: what the learner says they prefer;
- inferred/effective preference: what behavior and outcomes suggest works better;
- delivered configuration: what the system actually applied to learner-facing content;
- measured outcome: what happened after delivery.

Current conceptual definition:
- optimal educational content = content configuration that improves learning result;
- primary target = signed learning gain where available;
- supporting target = next-step success;
- duration/time = secondary operational signal, not the primary educational objective.

## Current Two-Layer Architecture

### Layer 1: six-factor policy / prediction layer

Purpose:
- build replay-safe pre-decision learner/context features;
- score or select six-factor candidate configurations;
- apply guardrails;
- return one delivered six-factor decision with explicit provenance.

Current implemented policy output:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

The active research formulation is candidate scoring:

```text
pre_decision_features + candidate_config -> predicted outcome
```

The runtime adapter converts app context into candidate scoring, selects a bounded safe candidate, and records metadata such as decision source, model version, backend kind, candidate count, confidence, and fallback state.

### Layer 2: rendering / LLM materialization layer

Purpose:
- translate the selected six-factor configuration into prompt instructions;
- preserve JSON, MCQ, dialogue, and safety contracts;
- validate external LLM output before saving it as normal learning content/test evidence.

Important distinction:
- `presentation_format` is a pedagogical presentation setting;
- technical `response_format=mcq`, `TestSchema`, and `learning_content_card` are hard output contracts;
- schema and safety always override personalization.

## Current System Modules

Main runtime surfaces:
- learner UI: `/learn`, `/practice`, `/profile`, analytics/insights, topics/subjects;
- operator/admin UI: `/admin/*`, including episode/export/prompt/policy observability where available;
- API layer: `src/app/api/**/route.ts`;
- persistence: Prisma/PostgreSQL;
- LLM access: `src/lib/llm/provider.ts`.

Main six-factor runtime modules:
- `src/lib/ml-six-factor-policy-contract.ts`
- `src/lib/ml-six-factor-policy-adapter.ts`
- `src/lib/ml-six-factor-artifact-loader.ts`
- `src/lib/ml-six-factor-candidate-generator.ts`
- `src/lib/ml-six-factor-runtime-scorer.ts`
- `src/lib/ml-six-factor-guardrails.ts`
- `src/lib/ml-six-factor-shadow.ts`
- `src/lib/ml-six-factor-apply.ts`
- `src/lib/ml-six-factor-render-mapping.ts`
- `src/lib/ml-six-factor-outcome-linking.ts`
- `src/lib/ml-six-factor-real-user-export.ts`

Main LLM-generation modules:
- `src/lib/llm/provider.ts`
- `src/lib/llm-prompt-builders.ts`
- `src/lib/test-generation.ts`
- `src/lib/learning-content-generation.ts`
- `src/lib/learning-dialogue.ts`
- `src/lib/generated-test-judge.ts`
- `src/lib/test-schema.ts`
- `src/lib/learning-content-schema.ts`

Legacy/support modules still exist for older prediction, heuristic baseline, statistics, and compatibility surfaces. They should be interpreted as baselines, adapters, or historical bridge logic unless a current six-factor document says otherwise.

## Current Implementation State

The repository contains:
- a six-factor runtime policy/apply path;
- a runtime-compatible JSON linear candidate scorer path;
- explicit heuristic/static fallback paths;
- strict LLM output validation and fallback marking;
- episode-level orchestration and outcome linkage;
- legacy two-factor/heuristic support paths kept for compatibility and comparison.

Interpretation rules:
- artifact-backed six-factor runtime is the current app-facing ML policy path when the artifact is valid;
- heuristic/static fallback is not ML;
- synthetic/bootstrap artifacts do not prove real learning effectiveness;
- old `difficulty + depth` documents or modules are not the current strategic scope unless explicitly marked as legacy baseline.

## Six-Factor Runtime Flow

```text
1. Learner enters a chat, test generation, learning content, or episode dialogue path.
2. App builds pre-decision learner/context features.
3. Six-factor adapter generates a bounded candidate set.
4. Guardrails remove unsafe candidates.
5. Runtime scorer evaluates candidates if the artifact is available and compatible.
6. Adapter selects a delivered six-factor configuration.
7. Apply mode maps the delivered configuration into prompt instructions.
8. LLM generates chat text, test JSON, or learning-content JSON.
9. JSON paths are parsed, repaired when possible, validated, and marked.
10. Generated artifacts are saved with validation/provenance metadata.
11. Later outcomes are linked for evaluation/export.
```

Runtime defaults:
- six-factor ML policy: enabled by default;
- six-factor metadata: enabled by default;
- learner-facing apply: enabled by default;
- opt-out flags disable ML/apply/metadata explicitly.

Common rollback flags:
- `EDUAI_SIX_FACTOR_ML_POLICY=0`
- `EDUAI_SIX_FACTOR_APPLY=0`
- `EDUAI_SIX_FACTOR_SHADOW=0`
- `EDUAI_SIX_FACTOR_SHADOW_ONLY=1`

## Evaluation Episode Alignment

The runtime can group related interactions into an explicit evaluation episode.

Current episode structure supports:
- `precheck`
- `learning_content`
- bounded learning dialogue
- `postcheck`
- optional `holdout`
- optional `delayed_recheck`

Tests remain the primary learning-evaluation signal. Chat/dialogue remains secondary support evidence.

Each linked artifact can be registered with:
- sequence role;
- item usage;
- practice-effect linkage;
- assigned policy arm;
- topic/concept/skill/family scope;
- delivered decision/provenance;
- recorded outcome when available.

## LLM Output Validation Boundary

External LLM output is not trusted blindly.

For generated tests:
- output must satisfy strict JSON/TestSchema rules;
- question count must match request;
- `answerIndex` must be valid and must not be silently rewritten;
- options must be non-empty and unique after normalization;
- explanations must be non-empty;
- fallback placeholder wording is rejected for LLM-generated tests;
- optional semantic judge can validate answer-key consistency when enabled.

For learning content:
- output must satisfy strict `learning_content_card` schema;
- content must remain topic-anchored;
- sections must be non-empty;
- six-factor support/example markers are validated where required.

Fallback outputs are marked as fallback and excluded from learning/training updates.

## High-Level Data Flow

1. The learner starts a structured flow, usually from `/learn`.
2. The API stores replay-safe behavioral and performance signals.
3. The six-factor policy builds features only from information available before the current decision point.
4. The policy selects a six-factor delivered configuration with explicit provenance.
5. The rendering layer maps the delivered configuration into LLM prompt instructions.
6. The LLM produces chat text, test JSON, or learning-content JSON.
7. Runtime validation repairs, accepts, rejects, or falls back.
8. Submit-time logging records actual outcomes and updates linked episode/item records.
9. Export can produce replay-safe rows for training/evaluation, including signed learning gain where available.

## Architectural Invariants

- No future leakage.
- No hidden fallbacks.
- UI must not contain core prediction logic.
- Prediction policies must be versioned and comparable.
- Heuristic/static fallback must never be described as ML.
- Synthetic artifact success must not be described as real educational effect.
- Tests are primary evaluation signals; chat is secondary support evidence.
- Answer keys remain server-side; client payloads stay sanitized.
- LLM-generated artifacts must pass validation before they are normal learning evidence.
- Fallback/invalid artifacts must be excluded from learning updates and training export.