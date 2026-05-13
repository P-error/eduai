# Research Specification

This document is the primary research framing document for dissertation-related decisions in EduAI.
It defines the intended research direction and the honesty constraints for interpreting the current prototype.
It is not a runtime behavior document and not a product-marketing document.

## 1. Current Implementation Baseline

- EduAI is a thesis-defensible prototype.
- Thesis topic: «Разработка прогнозирования оптимального образовательного контента для отдельных обучающихся с использованием машинного обучения».
- Current runtime still includes bridge/heuristic-heavy logic, explicit baselines, stubs, and partial artifact-backed paths.
- The first implemented pedagogical scope is intentionally narrow.
- Active runtime must not be described as fully model-owned unless current code, artifacts, and documentation explicitly support that claim.
- Bridge-stage support logic may help select or materialize decisions, but it is not equivalent to a trained EduAI-native pedagogical policy.
- Current implementation should be described as a transition state between heuristic-heavy bridge architecture and a more ML-ready research system.

## 2. Target Research Architecture

Target architecture keeps four concerns explicit, separated, and auditable.

### Learner state

- pre-decision snapshot of declared preferences, accessibility settings, behavioral evidence, performance history, topic context, mastery/readiness estimates, and uncertainty;
- declared, inferred, and effective preference must remain distinguishable;
- bridge logic must not silently mutate learner truth.

### Pedagogical decision / policy output

- the research object is the next pedagogical action or decision package shown to the learner;
- this may be produced by direct prediction/selection or by scoring candidate actions inside a policy;
- decision outputs must be versioned, provenance-aware, and replay-evaluable.

### Materialization / rendering

- rendering transforms a pedagogical decision into concrete content, hints, dialogue structure, wording, tone, format, and other presentation details;
- rules in this layer materialize decisions; they do not replace policy ownership.

### Provenance / evaluation / export

- every delivered decision must be linkable to learner-state snapshot, policy provenance, episode context, content artifact, and measured outcome;
- export, replay, backtesting, calibration, and comparison must remain possible without future leakage.

## 3. Preferred Problem Formulation

EduAI should predict or select the next pedagogical action, not merely tune two numeric parameters.

Key preference distinction:
- declared preference = what the learner says they prefer;
- inferred preference = the system estimate from observed behavior and performance;
- effective preference = what actually yields the best measurable learning result.

Working hypotheses:
- H1: declared preferences do not always match the content parameters that maximize measurable learning result.
- H2: behavioral and performance data identify effective content parameters more accurately than self-report alone.
- H3: personalization based on predicted effective preferences outperforms personalization based only on declared preferences.

Learning objective:
- optimal educational content = content that maximizes learning gain;
- first practical baseline proxy = next-task success probability;
- time may be used as a secondary metric or operational constraint, not as the main educational objective.

Intended use and signal hierarchy:
- the intended use scenario is educational use of learner-facing surfaces, not general-purpose assistant use;
- tests and structured episode checks are the primary learning signal;
- learner chat interaction is a secondary behavioral and adaptation signal;
- canonical topics are the core aggregation unit for modeling and evaluation;
- user collections, custom practice, or free-form interactions may exist for usability, but they do not silently replace the canonical modeling/evaluation frame.

## 4. Nearest Realistic ML Scope For Thesis Prototype

The nearest realistic target scope for a mature thesis prototype is a limited but serious pedagogical decision space, for example:
- `difficulty`
- `depth`
- `instructional_mode`
- `explanation_strategy`
- `question_format`
- `hint_policy`

Interpretation rules:
- this is the nearest realistic research target, not a claim that all listed outputs are already implemented;
- `difficulty` and `depth` remain the early baseline scope of the current implementation;
- the older narrow scope must no longer be described as the strategic limit of EduAI;
- the 10 axes remain an authoring/tagging taxonomy, not a set of equal ML targets;
- `education_level`, `domain`, `context`, and often `task_type` should usually be treated as context, features, or constraints;
- `cognitive_level` and `micro_complexity` may remain useful authoring/analysis axes, but they are not default first-wave ML targets when they largely overlap with challenge or difficulty.

## 5. Rendering / Rules Layer Non-Targets

Default non-targets for core ML ownership:
- `tone`
- `style`
- `formatting`
- `wording`
- presentation cosmetics

These may be materialization outputs or rendering helpers.
They may affect usability and perceived quality, but they must not be presented as the default core ML targets of the thesis system.
Rules may materialize, constrain, baseline, or compare decisions, but they must not silently become the hidden owner of learner-facing or state-mutating pedagogical decisions.

## 6. Bridge-Stage Honesty Constraints

- heuristics and stubs are not ML;
- heuristic backends are allowed only as explicit baselines, bridge logic, fallbacks, or comparison layers;
- bridge logic must not silently overwrite declared preference, learner state, or other learner truth;
- heuristics must not become hidden owners of pedagogical decisions in learner-facing or state-mutating paths;
- policy/backend provenance must stay explicit and versioned;
- prediction policies must remain comparable across baseline, heuristic, stub, and artifact-backed variants;
- reproducibility, replay, backtesting, and calibration must remain possible;
- no future leakage;
- no hidden fallbacks;
- no UI-side core prediction logic.

## 7. Data And Evaluation Requirements

Research-supporting data must capture enough information to reconstruct and evaluate each delivered pedagogical decision safely.

Required recorded elements:
- learner-state snapshot available before the decision;
- pedagogical decision shown to the learner;
- policy/backend provenance and decision source type;
- content/materialization metadata for the delivered artifact;
- topic, concept, or skill scope;
- episode linkage across pre-check, learning content, post-check, holdout, and delayed re-check when applicable;
- repetition versus isomorphic-same-skill metadata;
- timestamps and ordering needed for replay-safe evaluation;
- phase/origin metadata distinguishing bridge-stage synthetic data from real-user data.

Evaluation rules:
- delayed checks should be supported where possible;
- evaluation exports must be replay-safe and future-leakage-safe;
- tests remain the primary learning-evaluation signal;
- chat may be logged as a secondary/supporting signal, but not treated as an equal learning-gain measure;
- policy comparison must remain possible against explicit baselines rather than only against the currently active runtime.

## 8. Staged Rollout

1. First: establish ML-ready contracts, data capture, export formats, provenance, and serving boundaries, even if the active runtime still uses honest bridge-stage heuristics or stubs.
2. Second: expand into a limited but serious pedagogical decision scope with explicit decision ownership, explicit provenance, and evaluable learner-facing deployment.
3. Third: move toward stronger artifact-backed serving, stronger decision ownership, and retraining on real EduAI user data with clear separation from synthetic bridge artifacts.

Current transition-state reading:
- the repository is still primarily in the first stage, with partial scaffolding toward the second;
- synthetic or external bootstrap artifacts may support bridge-stage experimentation, but they do not replace real-user validation;
- documentation must remain explicit about what is actually trained, what is heuristic, and what is only target architecture.
