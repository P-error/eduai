# Learning Policy v2

Status:
- current implemented heuristic baseline;
- historical/reference policy for comparison;
- not the target dissertation ML policy.

Implementation sources:
- `src/lib/statistics.ts`
- `src/lib/recommendation.ts`
- `src/app/api/tests/[id]/submit/route.ts`
- `src/app/api/tests/generate/route.ts`
- `src/lib/chat.ts` (chat UX-only weak signal)

This document records the transparent heuristic update logic currently used in parts of the repository.
It remains useful as a reproducible baseline and comparison policy.
It must not be presented as machine learning.

## Position In The Research Stack

- declared preference and effective preference are conceptually distinct;
- this policy is a heuristic attempt to update user-facing personalization state from observed outcomes;
- it is a baseline for comparison against future ML policies focused on `difficulty` and `explanation depth`;
- tone/style/format decisions remain rendering-layer concerns, even when some current logic stores related stats.

## Baseline Objectives

- keep learner challenge within a target success band through explicit difficulty transitions;
- maintain transparent, auditable update formulas;
- gate updates on data quality;
- provide a comparison layer against future ML policies.

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

This exploration logic is heuristic baseline behavior.
It is not evidence that those axes are equal dissertation ML targets.

## Compliance and Gating

From generate pipeline:
- compliance computed on final observed tags (LLM or fallback result used for assignments)
- `deliveryComplianceFailed` if average/min axis threshold fails

Learning eligibility at test level:
- true only when generation source is llm, tagging source is llm, compliance passes

Submit-time skip reasons include:
- `DEFAULT_COLLECTION`
- `LOW_UX_COMPLIANCE`
- `LEARNING_INELIGIBLE`
- `INVALID_TAG_WARNINGS`

## Chat Policy Interaction

- Chat updates only UX axes: `tone`, `explanation_style`
- reward is intentionally weak proxy (`computeChatUxReward`):
  - short/very long responses -> 0.35
  - otherwise -> 0.5
- pedagogy stats are not updated from chat in current scope.

## Pseudocode

```text
on submit:
  validate ownership + payload + idempotency
  compute score + byTag
  compute uxReward (if telemetry present)
  compute difficultyDecision
  write attempt with _meta (learning/ux/pedagogy/policy/prediction)
  if skipReason != null: stop
  update UserTagStat:
    UX axes use fractional uxReward as correct increment
    Ped axes use binary correctness increment
  recompute effective prefs
  force difficulty_target = difficultyDecision.difficulty
```

## Interpretation Rules

- treat this policy as an explicit heuristic baseline and comparison layer;
- do not describe it as the dissertation ML solution;
- do not infer from this document that tone/style/format are current ML targets;
- if future ML policies replace parts of this behavior, keep versioned comparison against this baseline.

## Known Policy Limitations

- telemetry quality directly impacts UX update coverage,
- epsilon exploration can add noise for very low-N users.
- heuristic update formulas can diverge from the true effective preference signal.
