# Learning Policy v2

Implementation sources:
- `src/lib/statistics.ts`
- `src/lib/recommendation.ts`
- `src/app/api/tests/[id]/submit/route.ts`
- `src/app/api/tests/generate/route.ts`
- `src/lib/chat.ts` (chat UX-only weak signal)

## Objectives

- UX layer: optimize delivery fit using conservative engagement proxy.
- Pedagogy layer: keep learner in target accuracy band with controlled difficulty transitions.
- Keep updates transparent and gated by data quality.

## UX Reward Formula (tests)

`computeUxReward` inputs:
- `totalDurationMs`
- `answerChangeCount`
- `questionCount`
- dominant `difficulty_target` tag
- dominant `response_format` tag

Expected time lookup (`EXPECTED_TIME_MS`):
- easy: mcq 70000, short 90000, multipart 120000
- medium: mcq 100000, short 130000, multipart 170000
- hard: mcq 130000, short 170000, multipart 220000
- values are baseline totals for a 5-question test (`BASELINE_QUESTION_COUNT=5`)
- runtime baseline scales by question count:
  - `expectedTimeMs = EXPECTED_TIME_MS[difficulty][format] * (questionCount / 5)`
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
    UX axes use uxReward as correct increment
    Ped axes use binary correctness increment
  recompute effective prefs
  force difficulty_target = difficultyDecision.difficulty
```

## Why This Is Thesis-Defensible

- explicit quality gates block contaminated learning updates,
- formulas are simple, auditable, and bounded,
- confidence/sample-size framing is exposed in user/admin surfaces,
- prediction is labeled as heuristic proxy, not causal effect.

## Known Policy Limitations

- response-format taxonomy includes non-mcq tags while runtime blocks them in tests,
- telemetry quality directly impacts UX update coverage,
- epsilon exploration can add noise for very low-N users.
