# Admin Observability

Primary modules:
- API routes in `src/app/api/admin/*`
- aggregations in `src/lib/admin-observability.ts`
- calibration in `src/lib/prediction-metrics.ts`

## Admin Endpoints

- `GET /api/admin/analytics` (legacy summary)
- `GET /api/admin/data-quality-metrics`
- `GET /api/admin/personalization-metrics`
- `GET /api/admin/prediction-metrics`
- `GET /api/admin/prediction-backtest`
- `GET /api/admin/prediction-calibration`
- `GET /api/admin/dataset-export`
- `GET /api/admin/chat-metrics`
- `GET /api/admin/tests-metrics`

Auth:
- `getAdminFromRequest` (`user.isAdmin=true` required)
- otherwise `403 FORBIDDEN`

Legacy note:
- `GET /api/admin/analytics` is deprecated and now returns `410 Gone`.
- Use dedicated dashboards/endpoints (`data-quality`, `personalization`, `predictions`, `prediction-backtest`, `prediction-calibration`, `tests`).

## Common Filters

- `window`: `7d | 30d | all`
- `policyMode`: `any | personalization_on | personalization_off | manual_delivery_override`
- `subjectId`: optional
- `includeExcluded`: `1` to include learning-excluded samples

## Prediction Metrics Definitions

Implemented in `src/lib/prediction-metrics.ts`:
- MAE: `mean(abs(pred - actual))`
- RMSE: `sqrt(mean((pred - actual)^2))`
- Bias: `mean(pred - actual)`
- Over-rate: fraction of samples where `pred > actual`
- Under-rate: fraction where `pred < actual`

Bucket calibration:
- Accuracy buckets: `0.0–0.2`, `0.2–0.4`, `0.4–0.6`, `0.6–0.8`, `0.8–1.0`
- Duration buckets: `<30s`, `30–60s`, `60–120s`, `120–240s`, `240s+`

## Sample Eligibility / Exclusion

Accuracy sample requires:
- predicted expected accuracy present
- actual accuracy present
- values in valid range `[0,1]`
- passes active filters

Duration sample requires:
- predicted duration present
- actual duration telemetry present
- non-negative values
- passes active filters

Duration metadata compatibility:
- old rows without `durationConfidence`/`durationBasis` are treated as `confidence=0`, `basis=baseline_only`
- predictor versions are reported in duration sample metadata (e.g., `v3_duration_unified_2026_02`)

Tracked exclusion reasons:
- `MISSING_PREDICTION`
- `MISSING_ACTUAL`
- `MISSING_TELEMETRY`
- `OUT_OF_RANGE`
- `FILTERED_OUT`

## Attempt Cap

`getPredictionMetrics` scans up to 2000 attempts per request window (`MAX_ATTEMPTS=2000`).
Rationale:
- bounded request latency for admin pages,
- deterministic upper cost for prototype operations.

## Prediction Backtest (Replay)

Implemented in:
- engine: `src/lib/prediction-backtest.ts`
- API: `src/app/api/admin/prediction-backtest/route.ts`
- page: `src/app/admin/prediction-backtest/page.tsx`

Definition:
- for each historical attempt, compute policy prediction from strictly prior attempts only;
- compare predicted vs actual for that attempt;
- aggregate errors/calibration over the replay window.

Policy set:
- `v1_accuracy_raw_duration_baseline`
- `v2_accuracy_beta_duration_unified`

Backtest output includes:
- policy metrics (accuracy + duration)
- calibration buckets (accuracy)
- stratifications (`bySubject`, `byDifficultyTarget`)
- denominator accounting (`scanned` vs `used`)
- runtime stats (`attemptsScanned`, `attemptsUsed`, `runtimeMs`)
- logged mode comparator with `byPredictorVersion`

Eligibility filters:
- default: only `learningEligible === true`
- opt-in: `includeExcluded=1`, `includeUnknownEligibility=1`

Complexity guard:
- bounded time range and `maxAttempts`
- per-user bounded replay history window to avoid O(N^2) blow-up.

## Prediction Calibration

Implemented in:
- engine: `src/lib/prediction-calibration.ts`
- API: `src/app/api/admin/prediction-calibration/route.ts`
- page: `src/app/admin/prediction-calibration/page.tsx`

Purpose:
- replace fixed “magic numbers” with measured candidate selection using replay backtesting.

Tuned parameters:
- `diffAdjustMag`
- `betaA`, `betaB` (symmetric grid in current phase)
- `durationPriorQuestions`
- `durationFullEvidenceQuestions`

Evaluation protocol:
- chronological split:
  - first 70% of rows: calibration
  - last 30% of rows: holdout
- ranking objective (lexicographic):
  1. Accuracy RMSE
  2. |Accuracy Bias|
  3. Duration RMSE
  4. |Duration Bias|
  5. calibration proxy (bucket-weighted abs gap)

Stability guard:
- if holdout Accuracy RMSE of best-calibration candidate is >5% worse than default, system flags instability and recommends defaults.

Apply mode:
- `apply=1` writes `configs/calibrated_params.json`;
- runtime predictor modules read config when present, otherwise fallback to defaults.

## Dataset Export

Implemented in:
- engine: `src/lib/dataset-export.ts`
- API: `src/app/api/admin/dataset-export/route.ts`

Purpose:
- export anonymized training/evaluation records for offline experiments.

Defaults:
- `timeRangeDays=30`
- `maxAttempts=5000`
- `eligibleOnly=1`
- `consentOnly=1`
- `format=jsonl`

Privacy constraints:
- `userId`/`subjectId` are replaced with stable HMAC pseudonyms.
- no `email`, `name`, raw chat text, prompts, or answer payloads.

Leakage control:
- exported features for attempt `i` are computed from attempts strictly earlier than `i`.
- rolling aggregates update only after each row is emitted.

Record contract includes:
- metadata: `datasetVersion`, `generatedAtIso`, `policyId`, `predictorVersion`
- context: `difficultyTarget`, normalized active `responseFormat` (`mcq` in current runtime), `questionCount`
- replay-safe history features:
  - `userHistory_totalQuestionsBefore`
  - `userHistory_recentAccuracy`
  - `userHistory_betaPosteriorMean`
  - `userHistory_recentDurationPerQuestion`
  - `timeSinceLastAttemptSec`
- labels:
  - `actualAccuracy`
  - `actualTotalDurationMs`

## Data Quality Metrics

`/api/admin/data-quality-metrics` includes:
- attempts stack (total/eligible/excluded)
- excluded reasons top
- tagging source distribution
- compliance trend (pass/fail)
- retry trend
- avg tagging warnings trend

## Personalization Metrics

`/api/admin/personalization-metrics` includes:
- UX preset tone/style trends
- UX confidence distribution
- difficulty transitions trend
- exploration trend
- A/B usage share

## Chat Metrics

`/api/admin/chat-metrics` includes:
- chat events per day
- avg assistant length by explanation style
- personalization mode usage
- latency distribution buckets

## Test Metrics

`/api/admin/tests-metrics` includes:
- tests generated per day
- completion trend
- average score by difficulty
- prediction error trend
- predicted vs actual scatter sample rows
