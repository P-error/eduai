# API Reference (Current)

Base: Next.js App Router, endpoints under `src/app/api/**/route.ts`.
Auth: `Authorization: Bearer <JWT>` for protected routes (cookie fallback `eduai_token` is also supported).

## Auth

### `POST /api/auth/login`
- Auth: none
- Request:
  - legacy: `{ "identifier": string }`
  - password account: `{ "identifier": "<email>", "password": "<min 8 chars>" }`
- Response: `{ token, user }` and sets cookie `eduai_token` (30d, SameSite=Lax)
- Rate limit: per-IP hourly limit, returns `429` with `retryAfterSeconds`
- Errors: `INVALID_INPUT`, `INVALID_CREDENTIALS`, `PASSWORD_REQUIRED`, `RATE_LIMITED`, `DB_UNAVAILABLE`, `INTERNAL_ERROR`

### `POST /api/auth/register`
- Auth: none
- Request: `{ "email": string, "password": string, "name"?: string, "researchConsent"?: boolean }`
- Validation:
  - email format required
  - password length `8..128`
  - optional name max length `120`
- Behavior:
  - creates password-backed user (`externalId=email:<email>`)
  - hashes password server-side
  - if `researchConsent=true`, stores `researchConsentAt` and `researchConsentVersion`
  - returns same auth payload as login and sets `eduai_token` cookie
- Rate limit: per-IP hourly limit, returns `429` with `retryAfterSeconds`
- Errors: `INVALID_INPUT`, `EMAIL_TAKEN`, `RATE_LIMITED`, `DB_UNAVAILABLE`, `INTERNAL_ERROR`

## User/Profile/Preferences

### `GET /api/users/me`
- Auth: required
- Purpose: current user snapshot
- Errors: `UNAUTHORIZED`

### `GET /api/users/me/profile`
- Auth: required
- Purpose: aggregated v2 learning profile
- Errors: `AUTH_REQUIRED`, `INTERNAL_ERROR`

### `GET /api/users/me/stats`
- Auth: required
- Purpose: detailed user stats + policy metrics
- Errors: `UNAUTHORIZED`

### `GET /api/users/me/preferences`
- Auth: required
- Purpose: declared/effective preferences
- Errors: `UNAUTHORIZED`

### `PATCH /api/users/me/preferences`
- Auth: required
- Request: axis map `{ [axisKey]: tagKey }`
- Constraints: `response_format` only `mcq`
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`, `UNSUPPORTED_FEATURE`

### `POST /api/users/me/preferences/apply`
- Auth: required
- Purpose: copy effective -> declared
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`

### `GET /api/users/me/predictions`
- Auth: required
- Query: `subjectId` optional
- Purpose: expected accuracy/time + next difficulty + chat engagement prediction
- Policy switching: active predictor policy loaded from `configs/active_policy.json`
- Response includes `forTests.predictionPolicyId`
- Duration contract: `expectedTotalDurationMs` is produced by unified predictor `v3_duration_unified_2026_02` with `{ value, confidence, basis, components? }`
- Errors: `AUTH_REQUIRED`, `INTERNAL_ERROR`

### `GET /api/users/me/prediction-metrics`
- Auth: required
- Query: `window=7d|30d|all`, `subjectId`, `includeExcluded=1`
- Purpose: user-scope calibration metrics
- Errors: `AUTH_REQUIRED`

### `GET /api/users/me/dashboard`
- Auth: required
- Query:
  - `subjectId` optional
  - `limit` optional (`1..40`, default `20`)
- Purpose: read-only per-attempt dashboard rows for trend/consistency UI
- Response:
  - `attempts[]` row fields:
    - identity/context: `id`, `createdAt`, `subjectId`, `subjectTitle`, `topic`, `questionCount`
    - outcomes: `score`, `actualAccuracy`, `actualTotalDurationMs`
    - logged prediction meta (if present): `predictedAccuracy`, `predictedTotalDurationMs`, `durationConfidence`, `durationBasis`, `policyId`, `predictorVersion`
    - pedagogy hints: `difficulty.{current,next,changed,reason}`
    - gating hint: `learningEligible`
  - `summary`: availability flags for predicted accuracy/duration
- Errors: `AUTH_REQUIRED`

## Tests and Learning Pipeline

### `POST /api/tests/generate`
- Auth: required
- Request (core):
  - `subjectId`, `topic`, `questionCount`, `mode`
  - optional `sectionId`, `delivery`, `personalizationMode`
- Behavior:
  - policy mode resolution (personalized/baseline/manual override)
  - LLM generation + fallback
  - LLM tagging diagnostics + rule fallback
  - UX compliance + bounded retries
  - saves metadata in `validationMetaJson`
  - rate limiting: per-user daily + per-IP daily
- Response: `{ id, test: { title, questions[] } }`
- Contract: outbound `questions[]` is sanitized and never includes `answerIndex`
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`, `UNSUPPORTED_FEATURE`, `RATE_LIMITED`

### `POST /api/tests/[id]/submit`
- Auth: required
- Request:
  - `answers: number[]`
  - optional telemetry: `totalDurationMs`, `perQuestionFirstAnswerMs[]`, `answerChangeCount`
- Behavior:
  - ownership required
  - rate limiting: per-user per-minute + per-IP per-minute
  - strict answer length/type/range validation
  - one attempt per `(userId,testId)` enforced at DB-level (`TestAttempt_userId_testId_key`)
  - duplicate submit is idempotent: returns the existing attempt result
  - prediction logging policy id loaded from `configs/active_policy.json` and persisted to `_meta.prediction.policyId`
  - scoring + byTag + gated learning updates
- Response (stable + additive):
  - `{ score, byTag, meta, alreadySubmitted }`
- Errors:
  - `AUTH_REQUIRED`, `TEST_NOT_FOUND`, `FORBIDDEN_TEST_OWNERSHIP`,
  - `INVALID_ANSWERS_LENGTH`, `INVALID_ANSWER_TYPE`, `INVALID_ANSWER_RANGE`,
  - `INVALID_TELEMETRY_LENGTH`, `ALREADY_SUBMITTED`, `TEST_DATA_CORRUPT`, `RATE_LIMITED`, `INTERNAL_ERROR`

## Chat

### `POST /api/chat`
- Auth: required
- Request:
  - `messages: [{ role, content }]`
  - `personalizationMode?: "on"|"off"`
- Behavior:
  - applies v2 UX preset
  - stores chat signals
  - updates UX stats with weak reward proxy
- Response: `{ reply, meta: { policyMode, policyId, uxPreset, signalsStored } }`
- Errors: `AUTH_REQUIRED`, `INVALID_INPUT`, `LLM_BAD_RESPONSE`, `INTERNAL_ERROR`

### `POST /api/chat/send` (legacy)
- Auth: any (deprecated path)
- Status: `410 Gone`
- Response: `{ error: "deprecated", replacement: "/api/chat", details: "Use new redacted chat pipeline" }`

## Subjects/Sections/Collections

### Subjects
- `GET /api/subjects`
- `POST /api/subjects`
- `PATCH /api/subjects/[subjectId]`
- `DELETE /api/subjects/[subjectId]`
- `GET /api/subjects/[subjectId]/stats`
- `GET /api/subjects/[subjectId]/recommendation`

### Sections
- `GET /api/subjects/[subjectId]/sections`
- `POST /api/subjects/[subjectId]/sections`
- `PATCH /api/subjects/[subjectId]/sections/[sectionId]`
- `DELETE /api/subjects/[subjectId]/sections/[sectionId]`

### Collections
- `GET /api/collections`
- `POST /api/collections`
- `PATCH /api/collections/[id]`
- `DELETE /api/collections/[id]`

Common errors: `UNAUTHORIZED`, `INVALID_INPUT`, `NOT_FOUND`, `CONFLICT`.

## Admin

All admin endpoints require admin user (`user.isAdmin=true`):

### Metrics
- `GET /api/admin/analytics` (deprecated, returns `410`)
- `GET /api/admin/data-quality-metrics`
- `GET /api/admin/personalization-metrics`
- `GET /api/admin/prediction-metrics`
- `GET /api/admin/prediction-backtest`
- `GET /api/admin/prediction-calibration`
- `GET /api/admin/dataset-export`
- `GET /api/admin/chat-metrics`
- `GET /api/admin/tests-metrics`

Common query params:
- `window=7d|30d|all`
- `policyMode=any|personalization_on|personalization_off|manual_delivery_override`
- `subjectId` optional
- `includeExcluded=1` optional

### `GET /api/admin/prediction-backtest`
- Auth: admin required
- Purpose: replay prediction backtesting with policy comparison
- Query:
  - `policyA`, `policyB`:
    - `v1_accuracy_raw_duration_baseline`
    - `v2_accuracy_beta_duration_unified`
  - `timeRangeDays` (default `30`)
  - `maxAttempts` (default `1000`, bounded in engine)
  - `includeExcluded=0|1` (default `0`)
  - `includeUnknownEligibility=0|1` (default `0`)
- Response includes:
  - run metadata: `engineVersion`, `generatedAt`, `filters`, `timeRange`
  - denominators: scanned/used by eligibility class
  - per-policy metrics:
    - accuracy: MAE/RMSE/Bias + calibration buckets
    - duration: MAE/RMSE/Bias + p50/p90 abs error
    - stratified summaries by subject and difficulty
  - `loggedMode` summary (metrics from stored logged predictions for comparison)

### `GET /api/admin/prediction-calibration`
- Auth: admin required
- Purpose: deterministic grid-search calibration on top of replay backtesting
- Query:
  - `timeRangeDays` (default `30`)
  - `maxAttempts` (default `1000`)
  - `includeExcluded=0|1` (default `0`)
  - `includeUnknownEligibility=0|1` (default `0`)
  - `grid=small|medium|large` (default `small`)
  - `apply=0|1` (default `0`)
- Behavior:
  - split selected attempt window into chronological `70% calibration / 30% holdout`
  - evaluate policy-B candidates by objective tuple:
    1. Accuracy RMSE
    2. |Accuracy Bias|
    3. Duration RMSE
    4. |Duration Bias|
    5. Calibration proxy
  - if `apply=1`, writes recommended params to `configs/calibrated_params.json`
- Response:
  - `status: "ok" | "insufficient_data"`
  - default/best/holdout metrics
  - ranked top candidates
  - stability flags
  - apply outcome metadata

### `GET /api/admin/dataset-export`
- Auth: admin required
- Purpose: anonymized export for offline model training/backtesting
- Query:
  - `timeRangeDays` (default `30`)
  - `maxAttempts` (default `5000`)
  - `eligibleOnly=1|0` (default `1`)
  - `consentOnly=1|0` (default `1`)
  - `format=jsonl|csv` (default `jsonl`)
- Privacy:
  - user and subject are exported as stable HMAC pseudonyms (`userKey`, `subjectKey`)
  - no `email`, `name`, raw chat text, prompt text, or raw answer payload
- Labels:
  - `actualAccuracy`
  - `actualTotalDurationMs`
- Leakage control:
  - feature values for row `i` are computed from attempts strictly earlier than `i`

### Prompt templates
- `GET /api/admin/prompt-templates`
- `POST /api/admin/prompt-templates`
- `GET /api/admin/prompt-templates/[id]`
- `PATCH /api/admin/prompt-templates/[id]`
- `POST /api/admin/prompt-templates/[id]/activate`

## Curl examples

```bash
# login
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"demo@eduai.com"}'
```

```bash
# register
curl -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"student@example.com","password":"strong-pass-123","name":"student"}'
```

```bash
# generate test (personalized)
curl -X POST http://localhost:3000/api/tests/generate \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"subjectId":"SUBJECT_ID","topic":"Cell structure","questionCount":5,"mode":"practice","personalizationMode":"on"}'
```

```bash
# submit test with telemetry
curl -X POST http://localhost:3000/api/tests/TEST_ID/submit \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"answers":[0,1,2,3,0],"totalDurationMs":98000,"perQuestionFirstAnswerMs":[10000,19000,32000,51000,73000],"answerChangeCount":2}'
```

```bash
# chat (standard mode)
curl -X POST http://localhost:3000/api/chat \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Explain osmosis"}],"personalizationMode":"off"}'
```

```bash
# admin prediction metrics
curl 'http://localhost:3000/api/admin/prediction-metrics?window=30d&policyMode=any' \
  -H "authorization: Bearer $ADMIN_TOKEN"
```
