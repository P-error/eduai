# Prediction Layer

Prediction implementation:
- `src/lib/prediction.ts`
- `src/lib/prediction-duration.ts`
- `src/lib/prediction-backtest.ts`
- `src/lib/prediction-calibration.ts`
- `src/lib/prediction-params.ts`
- `src/lib/prediction-baselines.ts`
- `src/lib/statistics.ts`
- `src/app/api/users/me/predictions/route.ts`
- logging in `src/app/api/tests/[id]/submit/route.ts`

## What Is Predicted

For tests:
- `expectedAccuracy` (proxy)
- `expectedTotalDurationMs` (proxy)
- `nextDifficultySuggestion`

For chat:
- `predictedEngagement` (proxy)

These are not causal claims; they are heuristic, behavior-based estimates.

## Heuristics

### Expected Accuracy

Current implementation uses Beta-Binomial smoothing over recent attempt history.

Data source priority (`N=10` attempts window):
1. `subject_lastN_clean`
2. `subject_lastN_fallback`
3. `global_lastN_clean`
4. `insufficient_data`

Attempt evidence mapping:
- `totalQuestions = clampFloor(test.questionCount, min=1)`
- `correct = clamp(round(score * totalQuestions), 0..totalQuestions)`

Posterior and adjustment:
- prior: `Beta(a=1, b=1)`
- posterior mean: `(a + correctSum) / (a + b + totalQuestionsSum)`
- temporary difficulty adjust after posterior:
  - easy: `+diffAdjustMag` (default `+0.07`)
  - medium: `+0.00`
  - hard: `-diffAdjustMag` (default `-0.07`)
- final value: `clamp01(posterior + difficultyAdjust)`

Calibrated controls:
- `betaA`, `betaB` (defaults `1`, `1`)
- `diffAdjustMag` (default `0.07`)
- active values are resolved by `src/lib/prediction-params.ts` with fallback to defaults when config is absent/invalid.

Confidence:
- `confidence = clamp01(totalQuestionsSum / 100)`
- confidence depends on question-level evidence, not attempt count.

Basis:
- `<scope>|beta_binomial_posterior + difficulty_adjust`
- `insufficient_data` when no usable evidence.

Notes:
- this remains a heuristic proxy, not a causal model;
- difficulty adjustment is temporary and will be replaced by learned calibration later.

### Expected Total Duration

Single source-of-truth function:
- `predictExpectedTotalDurationMsUnified(...)` in `src/lib/prediction-duration.ts`
- predictor version: `v3_duration_unified_2026_02`

Used by:
- UI predictions (`buildUserPredictions` in `src/lib/prediction.ts`)
- submit-time logging (`src/app/api/tests/[id]/submit/route.ts`)

No separate UI-only or submit-only duration formula is used.

Baseline definition (authoritative):
- `BASELINE_QUESTION_COUNT = 5`
- `EXPECTED_TIME_MS[difficulty][format]` is interpreted as baseline for a 5-question test.
- scaling for arbitrary length:
  - `expected = EXPECTED_TIME_MS[difficulty][format] * (questionCount / 5)`
  - with clamps: `questionCount = max(1, floor(questionCount))`, difficulty/format clamped to supported values.

Unified blending:
- collect per-question first-answer telemetry from recent attempts
- recent attempt window: `DURATION_HISTORY_WINDOW_ATTEMPTS = 50`
- posterior per-question mean with baseline prior
- `evidenceWeight = clamp01(totalQuestions / 100)`
- `final = baseline * (1 - evidenceWeight) + telemetry * evidenceWeight`

No telemetry:
- `value = baseline`
- `confidence = 0`
- `basis = v3_duration_unified_2026_02|baseline_only`

Confidence:
- `confidence = evidenceWeight = clamp01(totalQuestions / 100)`

Calibrated controls:
- `durationPriorQuestions` (default `20`)
- `durationFullEvidenceQuestions` (default `100`)
- active values are resolved by `src/lib/prediction-params.ts`.

### Next Difficulty Suggestion

Uses band constants from policy:
- if `recentAccuracy > HIGH` -> suggest harder
- if `recentAccuracy < LOW` -> suggest easier
- else keep current

## Logging Predicted vs Actual

Written into `TestAttempt.byTagJson._meta.prediction` on submit:
- `expectedAccuracy`
- `expectedTotalDurationMs`
- `durationConfidence`
- `durationBasis`
- `durationComponents` (`baseline`, optional `telemetryAdjustment`)
- `predictorVersion`
- `computedAtIso`
- `policyMode`
- `policyId`
- `actualAccuracy`
- `actualTotalDurationMs`

This supports post-hoc calibration metrics without schema migration.

## Confidence Calculation

Confidence is heuristic and evidence-based:
- accuracy: `clamp(totalQuestionsSum / 100, 0, 1)`
- duration: `clamp(totalQuestions / 100, 0, 1)` where `totalQuestions` is telemetry evidence count used by unified duration predictor.

## Output API

`GET /api/users/me/predictions` returns:
- recommended preset snapshot
- predicted test outcomes + confidence + basis
- chat recommended UX + engagement proxy
- disclaimers and limitations

## Backtesting (Replay Evaluation)

Backtesting is implemented in:
- `src/lib/prediction-backtest.ts`
- API: `GET /api/admin/prediction-backtest`
- UI: `/admin/prediction-backtest`

Strict replay definition:
- for each attempt `i`, policy prediction is computed with history from attempts `< i` only;
- metrics aggregate prediction vs actual over that replay timeline.

Policies currently supported:
- `v1_accuracy_raw_duration_baseline` (baseline)
- `v2_accuracy_beta_duration_unified` (current)

Default sample filter:
- include only `learningEligible === true`
- optional overrides:
  - `includeExcluded=1`
  - `includeUnknownEligibility=1`

Backtest output contract includes:
- `engineVersion`
- `policyIds`
- `filters`
- `timeRange`
- `generatedAt`
- per-policy accuracy/duration metrics + calibration + stratifications.

## Calibration Runner

Calibration is implemented in:
- `src/lib/prediction-calibration.ts`
- API: `GET /api/admin/prediction-calibration`
- UI: `/admin/prediction-calibration`

Method:
- deterministic grid search over policy-B tuning params;
- objective tuple (lexicographic):
  1. Accuracy RMSE
  2. |Accuracy Bias|
  3. Duration RMSE
  4. |Duration Bias|
  5. calibration proxy
- chronological split:
  - first 70% of attempts in range: calibration
  - later 30%: holdout
- stability guard:
  - if best holdout Accuracy RMSE degrades >5% vs default, recommend default params.

Apply mode:
- `apply=1` writes `configs/calibrated_params.json`;
- runtime predictors read that config when present, otherwise use built-in defaults.

## Honesty Constraints

- No "learning gain" or "mastery" claims.
- All predictions are framed as proxies.
- Null values are returned when data is insufficient.
