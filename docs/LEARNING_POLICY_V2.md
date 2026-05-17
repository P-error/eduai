# Learning Policy v2 (Legacy Heuristic Baseline)

Status:
- legacy/current-comparison heuristic baseline;
- historical/reference policy for comparison;
- not the current six-factor ML runtime policy;
- not the target dissertation evidence by itself.

This document records the transparent heuristic update logic used in parts of the repository and preserved for baseline comparison. It must not be presented as machine learning.

For the current six-factor runtime policy, use:
- `docs/PREDICTION_LAYER.md`
- `docs/ml_six_factor_runtime_policy_adapter.md`
- `docs/ml_six_factor_apply_mode.md`
- `docs/ml_dataset_contract.md`

Implementation sources historically associated with this baseline:
- `src/lib/statistics.ts`
- `src/lib/recommendation.ts`
- `src/app/api/tests/[id]/submit/route.ts`
- `src/app/api/tests/generate/route.ts`
- `src/lib/chat.ts` (chat UX-only weak signal)

## Position In The Research Stack

- declared preference and effective preference are conceptually distinct;
- this policy is a heuristic attempt to update user-facing personalization state from observed outcomes;
- it is a comparison baseline against the current six-factor candidate-scoring policy;
- older references to `difficulty` and `explanation depth` describe the historical two-factor bridge, not the current full six-factor runtime;
- tone/style/format updates in this baseline are UX/rendering evidence, not the current six-factor ML policy by themselves.

## Baseline Objectives

- keep learner challenge within a target success band through explicit difficulty transitions;
- maintain transparent, auditable update formulas;
- gate updates on data quality;
- provide a reproducible comparison layer against artifact-backed six-factor policies.

## UX Reward Formula (tests)

`computeUxReward` inputs:
- `totalDurationMs`
- `answerChangeCount`
- `questionCount`
- dominant `difficulty_target` tag
- active `response_format` tag (`mcq` only)

Expected time lookup (`EXPECTED_TIME_MS`):
- easy: mcq 70000
- medium: mcq 100000
- hard: mcq 130000
- values are baseline totals for a 5-question test (`BASELINE_QUESTION_COUNT=5`)
- runtime baseline scales by question count:
  - `expectedTimeMs = EXPECTED_TIME_MS[difficulty].mcq * (questionCount / 5)`
  - with clamp `questionCount = max(1, floor(questionCount))`

Formula:
- `timeScore = clamp01(expectedTimeMs / max(totalDurationMs, 1))`
- `changePenalty = clamp01(answerChangeCount / (questionCount * 2))`
- `uxReward = clamp01(0.85 * timeScore + 0.15 * (1 - changePenalty))`

If `totalDurationMs` is missing:
- UX reward is ineligible, and UX tag stats are not updated for this attempt.

## Pedagogy Difficulty Band Logic

Constants (`src/lib/tags.ts`):
- `TARGET_SCORE_BAND.low = 0.65`
- `TARGET_SCORE_BAND.high = 0.80`
- `MIN_ATTEMPTS_PER_DIFF = 5`
- `DIFF_COOLDOWN_ATTEMPTS = 3`

Smoothing:
- `smoothed = (sum(scores) + 1) / (n + 2)` (Beta(1,1) prior)

Decision (`decideDifficultyTarget`):
- if no data -> keep (`NO_DATA`)
- if `n < 5` -> keep (`LOW_N`)
- if cooldown active -> keep (`COOLDOWN`)
- if `smoothed > 0.80` -> step harder (`INCREASE`)
- if `smoothed < 0.65` -> step easier (`DECREASE`)
- else keep (`WITHIN_BAND`)

## Exploration

Pedagogy exploration (`src/lib/recommendation.ts`):
- epsilon-greedy on `cognitive_process`, `task_family`, `context`
- `RECOMMENDATION_EPSILON_PED = 0.10`
- when exploring: random tags for those axes
- `difficulty_target` remains policy-driven

This exploration logic is heuristic baseline behavior. It is not evidence that those axes are equal dissertation ML targets.

## Compliance and Gating

Learning eligibility must remain strict enough to avoid contaminating training/evaluation data.

Current hardening rules that matter for this baseline:
- fallback generated tests are not learning-eligible;
- invalid or generated-invalid artifacts must not be treated as normal learning evidence;
- fallback/mixed tagging can exclude learning updates;
- strict generated-test and learning-content validation metadata should be preserved;
- optional semantic judge status should be recorded when enabled;
- missing optional rendering-style evidence is not itself a low-UX-compliance failure.

Learning eligibility at test level:
- true only when generation and tagging evidence meet the current runtime gates;
- false when `generationSource="fallback"` or equivalent fallback/invalid generation metadata is present.

Submit-time skip reasons may include:
- `DEFAULT_COLLECTION`
- `LOW_UX_COMPLIANCE`
- `LEARNING_INELIGIBLE`
- `INVALID_TAG_WARNINGS`
- `FALLBACK_GENERATION`

## Chat Policy Interaction

- Chat updates only weak UX/support signals in legacy paths.
- Chat-derived reward remains a weak proxy and must not be treated as a primary learning-gain measure.
- Episode learning dialogue is secondary support evidence; tests remain primary.

## Pseudocode

```text
on submit:
  validate ownership + payload + idempotency
  reject corrupt stored test data
  compute score + byTag
  compute uxReward when telemetry is present
  compute difficultyDecision for legacy baseline comparison
  write attempt with _meta (learning/ux/pedagogy/policy/prediction/evaluation)
  if skipReason != null: stop learning update
  update eligible UserTagStat rows
  recompute effective prefs where applicable
  keep baseline provenance explicit
```

## Interpretation Rules

- Treat this policy as a heuristic baseline and comparison layer.
- Do not describe it as the dissertation ML solution.
- Do not infer from this document that the current runtime is still only `difficulty + depth`.
- Do not infer from this document that tone/style/format are the current ML policy by themselves.
- Compare it against the six-factor ML policy only with explicit provenance and outcome-linked rows.

## Known Policy Limitations

- telemetry quality directly impacts UX update coverage;
- epsilon exploration can add noise for very low-N users;
- heuristic update formulas can diverge from the true effective preference signal;
- the policy does not evaluate the full six-factor candidate space;
- it remains useful mainly as a transparent baseline, not as the current ML runtime claim.