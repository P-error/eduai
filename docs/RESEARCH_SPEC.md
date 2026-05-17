# Research Specification

This document is the primary dissertation-facing research framing document for EduAI. It defines the research problem, implemented scope, and honesty constraints for interpreting the current prototype.

It is not a product-marketing document and must not be used to overclaim educational effectiveness.

## 1. Current Implementation Baseline

EduAI is a thesis-defensible research prototype for predicting and applying educational content configurations for individual learners.

The earlier implementation focused mainly on `difficulty` and `depth`. That two-factor framing is now a legacy bridge/baseline reference, not the current runtime research boundary.

The current implemented runtime policy uses a six-factor pedagogical configuration:

- `difficulty`: `easy | medium | hard`
- `depth`: `brief | standard | detailed`
- `support_level`: `minimal | guided | scaffolded`
- `presentation_format`: `paragraph | structured_list | step_by_step | qa`
- `examples_level`: `none | single | multiple`
- `terminology_level`: `simple | balanced | technical`

The current policy is best described as a six-factor candidate-scoring runtime with explicit provenance, guardrails, fallback marking, LLM-output validation, and outcome-linking/export contracts.

Current honesty state:
- the app can apply six-factor decisions to learner-facing prompts by default;
- the runtime can use an artifact-backed linear candidate scorer when the configured artifact is available;
- the current artifact may be synthetic or bootstrap-derived;
- synthetic/model-slot validation does not prove real educational effectiveness;
- real-user or controlled learner outcome data is still required for final effect claims.

## 2. Target Research Architecture

Target architecture keeps four concerns explicit, separated, and auditable.

### Learner state

The policy receives a pre-decision snapshot of learner/context information, such as declared preferences, prior performance aggregates, recent performance, topic exposure, session position, and topic/concept/skill context.

Required rule:
- pre-decision features must not contain future outcomes, post-test scores, normalized learning gain, next-step success, raw answer payloads, or hidden labels.

### Pedagogical decision / policy output

The research object is the next pedagogical content configuration shown to the learner.

Current decision package:

```text
SixFactorCandidateConfigV1
```

The policy may be implemented as candidate scoring:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

Runtime then selects a delivered six-factor configuration subject to guardrails and fallback rules.

### Materialization / rendering

Materialization transforms the selected six-factor decision into concrete LLM prompt instructions and learner-facing content.

Important distinction:
- `presentation_format` is a pedagogical presentation preference;
- technical `response_format=mcq` / `TestSchema` is a hard output contract;
- personalization must never break JSON schemas, MCQ structure, answer keys, option counts, required keys, or safety constraints.

### Provenance / evaluation / export

Every delivered decision should be linkable to:
- learner-state snapshot before the decision;
- candidate/delivered six-factor configuration;
- policy/backend provenance;
- prompt/materialization metadata;
- generated content/test artifact;
- validation/fallback status;
- measured outcome when available;
- episode sequence role such as precheck, learning content, postcheck, holdout, or delayed recheck.

## 3. Preferred Problem Formulation

EduAI should estimate which pedagogical content configuration is likely to improve learning for the current learner/context state.

Key preference distinction:
- declared preference = what the learner says they prefer;
- inferred preference = the system estimate from observed behavior and performance;
- effective preference = what actually yields the best measurable learning result.

Working hypotheses:
- H1: declared preferences do not always match the content parameters that maximize measurable learning result.
- H2: behavioral and performance data identify effective content parameters more accurately than self-report alone.
- H3: personalization based on predicted effective preferences outperforms personalization based only on declared preferences or static/heuristic baselines.

Learning objective:
- optimal educational content = content configuration that maximizes measured learning improvement;
- primary target = signed learning gain where available;
- supporting target = next-step success;
- time/duration may be used as a secondary metric or operational constraint, not the main educational objective.

## 4. Current ML Scope For Thesis Prototype

The current implemented decision space is six-factor and bounded:

```text
3 difficulty values
* 3 depth values
* 3 support values
* 4 presentation values
* 3 examples values
* 3 terminology values
= 972 possible configurations
```

Runtime serving normally evaluates a bounded candidate set around safe/static/heuristic/current candidates rather than scoring the entire grid on every request.

The six-factor runtime should be interpreted as:
- an implemented policy/application contract;
- an auditable candidate-scoring formulation;
- a runtime path that can be verified with metadata and prompt snapshots;
- not, by itself, proof of educational effect.

The old `difficulty + depth` scope remains useful only as:
- historical bridge framing;
- baseline comparison;
- compatibility adapter language in older modules/docs;
- a simplified explanation when explicitly marked as legacy.

## 5. Rendering / Rules Layer Boundaries

The six-factor policy owns pedagogically meaningful content configuration. Rendering/prompt rules materialize that configuration into actual LLM instructions and output constraints.

Rendering rules may:
- translate selected factors into prompt wording;
- enforce visible support/example markers where the output format allows;
- preserve schema and safety precedence;
- provide fallback behavior when the ML artifact is unavailable or unsafe.

Rendering rules must not:
- silently replace the selected policy decision;
- hide fallback as ML;
- mutate learner truth;
- turn invalid LLM output into normal learning evidence;
- change answer keys or schemas for style compliance.

## 6. Bridge, Fallback, And Honesty Constraints

- Heuristics and static defaults are not ML.
- Synthetic artifacts are not real-user validation.
- Fallback is allowed only if explicitly recorded.
- ML/apply metadata must distinguish `ml_policy`, heuristic/static fallback, shadow-only, and provider/artifact failure states.
- Generated tests/content must be validated before being treated as normal artifacts.
- Fallback or invalid generated artifacts must be excluded from learning/training updates.
- No future leakage.
- No hidden fallbacks.
- No UI-side core prediction logic.
- No claim of causal learning gain without outcome-linked evaluation.

## 7. Data And Evaluation Requirements

Research-supporting data must capture enough information to reconstruct and evaluate each delivered decision safely.

Required recorded elements:
- learner-state snapshot available before the decision;
- candidate/delivered six-factor configuration;
- policy/backend provenance and decision source type;
- artifact/model version and fallback status;
- prompt/materialization metadata;
- generated content/test validation metadata;
- topic, concept, or skill scope;
- episode linkage across precheck, learning content, postcheck, holdout, and delayed recheck when applicable;
- timestamps and ordering needed for replay-safe evaluation;
- phase/origin metadata distinguishing synthetic/bootstrap data from real-user data.

Evaluation rules:
- tests remain the primary learning-evaluation signal;
- chat/dialogue remains a secondary support signal;
- delayed and holdout checks should be supported where possible;
- evaluation exports must be replay-safe and future-leakage-safe;
- policy comparison must remain possible against declared-preference, static, heuristic, and ML-policy baselines.

## 8. LLM Generation Quality Boundary

External LLM output is not treated as automatically correct.

Generated test/content paths must preserve:
- strict JSON contracts;
- repair/retry diagnostics;
- deterministic validation;
- optional semantic test judge when enabled;
- fallback marking;
- learning exclusion for fallback or invalid artifacts.

For generated tests:
- `answerIndex` must point to the only correct option;
- invalid `answerIndex` must not be silently normalized;
- explanations must not contradict the answer key;
- fallback tests must not be counted as normal learning evidence.

## 9. Staged Rollout

Current stage:
- six-factor runtime/apply contract exists;
- synthetic/bootstrap artifact path can verify runtime scoring/application;
- prompt and LLM-output validation are hardened;
- strict exports and episode linkage support later analysis.

Next required stage:
- run DB-backed evidence checks with PostgreSQL available;
- run live-provider prompt compliance safely;
- enable optional semantic judge in controlled runs;
- collect eligible outcome-linked real/control observations;
- train or select final runtime-compatible model artifact;
- compare ML policy against explicit baselines.

Final effect claims require:
- outcome-linked rows;
- clear baseline comparison;
- leakage-safe feature construction;
- exclusion of fallback/invalid artifacts;
- transparent sample sizes and limitations.