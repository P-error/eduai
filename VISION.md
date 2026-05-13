# EduAI Vision

EduAI is a thesis-defensible prototype for machine-learning-based prediction and selection of pedagogically meaningful next educational actions for individual learners.
This document describes the target product direction. It is not a claim about current runtime behavior.

## Current Implementation Baseline

- current runtime still contains bridge/heuristic-heavy logic, explicit baselines, stubs, and partial artifact-backed paths;
- current implementation is not yet equal to the target research architecture;
- the first implemented decision scope is intentionally narrow and should be described as a current baseline, not as the limit of the product;
- active runtime must not be presented as fully model-owned unless model ownership is explicitly implemented, versioned, and auditable.

## Product Goal

EduAI should help a learner receive the next pedagogically appropriate educational action or content that maximizes learning gain rather than merely mirror self-reported preferences.

The core mismatch remains:
- declared preference: what the learner says they prefer;
- inferred preference: the system estimate from observed behavior and performance;
- effective preference: what actually yields the best measurable learning result.

EduAI should make that mismatch visible, keep those states distinct, and use behavioral and performance data to support better next-step pedagogical decisions.

## Core System Objects

### Learner state

Learner state is the pre-decision snapshot that the system uses to act responsibly.
It includes declared settings, accessibility needs, observed behavior, performance evidence, topic scope, episode history, and uncertainty.
These states must remain explicit and must not be silently rewritten by bridge-stage heuristics.

### Pedagogical decision

The center of the system is the next pedagogical decision, not a pair of UI sliders.
A mature EduAI policy may:
- directly choose the next pedagogical action;
- score candidate pedagogical actions for later policy selection.

That decision space may eventually include a limited but meaningful set of outputs such as `difficulty`, `depth`, `instructional_mode`, `explanation_strategy`, `question_format`, and `hint_policy`.
Current runtime does not yet fully own that space.

### Materialization / rendering

Rendering turns a pedagogical decision into a concrete explanation, practice item, hint, or interaction step.
Tone, style, wording, formatting, and presentation cosmetics belong here by default.
They help materialize decisions; they are not the core ML target of the product.

### Provenance / evaluation

Every learner-facing decision should remain auditable.
The system direction depends on explicit policy provenance, episode linkage, replay-safe evaluation, and exportable evidence rather than opaque adaptation claims.

## Product Surfaces

The target product remains organized around five core learner-facing sections:
- `Профиль`
- `Обучение`
- `Практика`
- `Аналитика`
- `Темы`

These surfaces should behave as follows:
- `Профиль` separates declared settings, accessibility settings, system inferences, and account/context data.
- `Обучение` is the main educational explanation/dialogue surface, not a general-purpose assistant.
- `Практика` is the main structured evidence surface; `Core` is primary and `Custom` remains secondary.
- `Аналитика` shows progress, recommendations, uncertainty, and provenance honestly.
- `Темы` remain the canonical learning structure; user collections may overlay but not replace that structure.

## Primary Learner Loop

1. A learner studies through an episode-first loop across `Обучение` and `Практика`.
2. EduAI records replay-safe behavioral and performance evidence.
3. The decision layer predicts or selects the next pedagogical action, or scores candidate actions for selection.
4. The rendering layer materializes that decision into explanations, practice, hints, and presentation details.
5. `Аналитика` exposes progress, confidence, and evidence with explicit provenance.

## Two-Layer System Logic

Layer 1 is the prediction/selection layer for pedagogically meaningful decision outputs.
It exists to choose or rank the next pedagogical action in a way that can later be evaluated against learning gain.
It must not be described as equivalent to the current bridge-stage runtime.

The nearest defendable thesis scope is limited but already wider than two parameters.
`difficulty` and `depth` remain the early baseline scope of the current implementation, not the strategic boundary of EduAI.
A mature thesis prototype may extend the limited decision space to `instructional_mode`, `explanation_strategy`, `question_format`, and `hint_policy` while keeping versioning, provenance, and replay safety explicit.

Layer 2 is the materialization and rendering layer.
It maps decisions into tone, style, wording, formatting, and concrete presentation details.
Rules are expected here, but they must not silently own learner-facing or state-mutating pedagogical decisions.

## Learning And Signal Logic

EduAI is designed for an educational-only scenario.
Tests and structured episode checks are the primary learning signal.
Learner chat is a secondary behavioral and adaptation signal.
Exploratory variation may exist as an internal bounded mechanism for data collection and better estimation, but it is not the normal public mode.

## Product Requirements

- explicit separation of learner state, pedagogical decision, and materialization;
- explicit distinction between declared, inferred, and effective preferences;
- optimization objective grounded in learning gain;
- first practical proxy based on next-task success probability;
- time used only as a secondary metric or operational constraint;
- versioned and comparable policies;
- auditable provenance, reproducible evaluation, backtesting, calibration, and replay-safe exports;
- no future leakage, no hidden fallbacks, and no core prediction logic embedded in the UI.

## Non-Goals

EduAI is not:
- a general-purpose chatbot;
- a product where tone/style cosmetics are mistaken for pedagogical intelligence;
- a system where heuristics silently own pedagogical decisions;
- a claim that the active runtime is already fully model-owned;
- a claim that the early `difficulty` + `depth` baseline is the final architectural limit of EduAI.
