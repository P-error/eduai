# Prediction Layer

This document describes the current prediction/policy runtime for EduAI after the six-factor candidate-scoring integration.

Older prediction documents and modules that focus only on `difficulty`, `depth`, `expectedAccuracy`, or duration remain useful as legacy baselines, compatibility adapters, or operational diagnostics. They are no longer the full dissertation-facing runtime policy description.

## Implementation Map

Current six-factor runtime implementation:
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

Offline ML/training layer:
- `ml/src/eduai_ml/training/*`
- `ml/contracts/*`
- `ml/schemas/*`
- `ml/scripts/train_candidate_scorer.py`
- `ml/scripts/evaluate_candidate_scorer.py`

Legacy/support prediction modules:
- `src/lib/prediction.ts`
- `src/lib/prediction-runtime.ts`
- `src/lib/prediction-contract.ts`
- `src/lib/prediction-feature-layer.ts`
- `src/lib/prediction-ml.ts`
- `src/lib/prediction-backtest.ts`
- `src/lib/prediction-calibration.ts`
- `src/lib/personalization-runtime.ts`
- `src/lib/recommendation.ts`
- `src/lib/statistics.ts`

Interpret legacy modules as baseline/support infrastructure unless a current six-factor runtime document explicitly uses them.

## Research Contract

The prediction layer exists to infer effective pedagogical content configuration, not merely to echo declared preferences.

Core distinction:
- declared preference = what the learner says they prefer;
- inferred/effective preference = what measured behavior and outcomes suggest works better;
- candidate configuration = one possible six-factor content configuration;
- delivered configuration = the six-factor configuration actually applied to learner-facing content;
- outcome = measured result observed after delivery.

Current dissertation-facing runtime decision space:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

## Candidate-Scoring Formulation

The current policy formulation is:

```text
pre_decision_features + candidate_config -> predicted outcome
```

The runtime then selects a safe delivered configuration from a bounded candidate set.

This avoids treating the task as six unrelated label predictions. It also allows the system to ask: “Given the learner state and this candidate configuration, what outcome should we expect?”

Target/outcome concepts:
- signed learning gain is the primary training/evaluation target where available;
- next-step success is a supporting target;
- combined outcome score may be used for runtime ranking;
- duration/time is secondary and must not become the main educational objective.

## Factor Space

The full six-factor grid contains 972 possible configurations:

```text
3 difficulty values
* 3 depth values
* 3 support values
* 4 presentation values
* 3 example values
* 3 terminology values
```

Runtime normally scores a bounded deterministic candidate set that includes safe/static, heuristic bridge, nearby, and exploration candidates. It does not need to score the full 972-grid on every request.

## Runtime Defaults And Flags

Current runtime defaults:
- six-factor ML policy is enabled by default;
- six-factor metadata construction is enabled by default;
- learner-facing prompt application is enabled by default.

Rollback/diagnostic flags:
- `EDUAI_SIX_FACTOR_ML_POLICY=0|false|off` disables artifact-backed candidate scoring and uses legacy/static fallback;
- `EDUAI_SIX_FACTOR_SHADOW=0|false|off` disables six-factor metadata construction;
- `EDUAI_SIX_FACTOR_APPLY=0|false|off` disables learner-facing prompt application;
- `EDUAI_SIX_FACTOR_SHADOW_ONLY=1|true|on` scores/logs but does not apply to learner-facing prompts;
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH` selects the runtime artifact path.

If no artifact path is set, the current intended runtime artifact is:

```text
artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

## Runtime Artifact Compatibility

The TypeScript runtime supports compatible JSON linear candidate scorer artifacts.

Runtime-compatible family:
- `linear_candidate_scorer_v1` / `linear_candidate_scorer_payload.v1`

Tree models may exist in the offline Python training/evaluation layer, but they are not automatically runtime-compatible unless a TypeScript tree scorer/loader is implemented. If an artifact is missing, invalid, unsupported, or scoring fails, the app must fall back explicitly and record the reason.

## Guardrails

Candidate guardrails prevent unsafe selected configurations, especially for unknown or weak learner states.

Examples:
- unknown/low-correct learner state cannot select risky `hard + brief + minimal` combinations;
- weak state requires guided/scaffolded support;
- weak state requires at least one example;
- technical terminology requires confident topic mastery;
- if all candidates are unsafe, the runtime uses a safe fallback candidate and records the fallback/guardrail reason.

## Rendering Boundary

The prediction layer outputs the six-factor configuration. The rendering layer maps that configuration into prompt instructions.

Hard precedence:
1. safety/factuality;
2. technical schema/output contract;
3. six-factor pedagogical style;
4. declared preferences and other weaker hints.

For tests:
- `response_format=mcq`, `TestSchema`, option structure, question count, and `answerIndex` are mandatory;
- personalization may affect wording, difficulty, explanation style, examples, hints, and terminology only inside allowed fields;
- personalization must not add JSON keys or change answer-key semantics.

For chat and learning content:
- six-factor settings may shape explanation, structure, support, examples, and terminology;
- internal metadata and learner-state numbers must not be revealed to the learner.

## Logging And Provenance

Runtime metadata should distinguish:
- `decisionSource` such as `ml_policy`, `heuristic_baseline`, `static_fallback`, or shadow-only modes;
- `policyId`;
- `modelVersion`;
- `backendKind`;
- `artifactPath`;
- `fallbackUsed`;
- `candidateCount`;
- `confidence` where available;
- `appliedToLearnerFacingOutput`;
- `appliedPath`.

No UI, export, or report should imply that a fallback decision was an ML decision.

## Replay-Safe Feature Rules

Feature construction must use only information available before the current decision.

Forbidden feature fields include:
- `pre_score`
- `post_score`
- `next_step_success`
- `normalized_learning_gain`
- `normalized_learning_gain_clamped`
- `outcome_available`
- raw answers
- hidden labels
- future test outcomes.

Allowed features include prior/recent aggregate performance, topic exposure, session position, declared preferences, subject/topic identifiers or hashed encodings, and other replay-safe context.

## Outcome And Target Rules

Signed learning gain is the current primary target form where pre/post checks allow it.

Expected convention:
- `normalized_learning_gain` is signed and may be negative;
- negative values represent deterioration after content;
- `normalized_learning_gain_clamped` is a legacy/nonnegative compatibility field, not the primary signed target;
- rows with unavailable outcome are useful for audit but not supervised target training.

## LLM Quality Boundary

Generated tests and learning content are downstream of the prediction layer. They must be validated before their outcomes are used.

The runtime should record:
- generation source: `llm`, `llm_repaired`, or `fallback`;
- JSON diagnostics;
- deterministic validation result;
- optional semantic judge status;
- learning eligibility/exclusion reason.

Fallback or invalid generated artifacts must be excluded from learning/training updates.

## Evaluation And Comparison

Policy comparison must remain possible against:
- static/default baseline;
- declared-preference/self-report baseline;
- heuristic baseline;
- artifact-backed ML policy;
- fallback/shadow-only diagnostic modes.

Evaluation requirements:
- replay order must be strict;
- no future leakage;
- outcome-linked rows only for supervised effect/training claims;
- fallback/generated-invalid artifacts excluded;
- sample sizes and confidence limitations reported.

## Practical Interpretation

Use this document with:
- `docs/RESEARCH_SPEC.md` for research framing;
- `docs/ml_dataset_contract.md` for training row contract;
- `docs/ml_six_factor_runtime_policy_adapter.md` for runtime/app adapter details;
- `docs/ml_six_factor_apply_mode.md` for learner-facing prompt application;
- `docs/llm_prompt_strictness_rules.md` for LLM/schema precedence and validation behavior.

Do not use older two-factor wording as the current runtime truth unless it is explicitly marked as legacy baseline/reference.