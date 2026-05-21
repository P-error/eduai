# API Reference (Current)

Base: Next.js App Router, endpoints under `src/app/api/**/route.ts`.
Auth: protected user-facing routes use the httpOnly cookie session `eduai_session`. Admin access depends on stored `user.isAdmin=true`; email domain is not an access signal.

## Operational Health

### `GET /api/health`
- Auth: none
- Purpose: process/app liveness only
- Response: `{ ok: true, status: "alive", checkedAtIso }`

### `GET /api/ready`
- Auth: none
- Purpose: pilot-readiness gate for runtime dependencies/config
- Response:
  - `200` when all readiness checks are green
  - `503` when any required dependency/config is not operationally ready
- Checks:
  - DB reachability
  - Prisma/runtime schema contract
  - auth/session config sanity
  - external rate limiter backend reachability
  - prediction runtime interpretability
  - artifact slot/runtime artifact interpretability
  - required LLM configuration sanity

## Auth

### `POST /api/auth/login`
- Auth: none
- Request:
  - `{ "identifier": "<email>", "password": "<min 8 chars>" }`
- Response: `{ ok, user }` and sets cookie `eduai_session` (`HttpOnly`, `SameSite=Lax`, 30d)
- Rate limit: per-IP hourly limit, returns `429` with `retryAfterSeconds`
- Errors: `INVALID_INPUT`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `DB_UNAVAILABLE`, `INTERNAL_ERROR`

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
  - returns `{ ok, user }` and sets `eduai_session`
- Rate limit: per-IP hourly limit, returns `429` with `retryAfterSeconds`
- Errors: `INVALID_INPUT`, `EMAIL_TAKEN`, `RATE_LIMITED`, `DB_UNAVAILABLE`, `INTERNAL_ERROR`

### `POST /api/auth/logout`
- Auth: optional
- Behavior:
  - clears `eduai_session` by expiring the cookie
  - official user-facing logout path for the learner shell
- Response: `{ ok: true }`

## User/Profile/Preferences

### `GET /api/users/me`
- Auth: required
- Purpose: current user snapshot
- Errors: `UNAUTHORIZED`

### `PATCH /api/users/me`
- Auth: required
- Request: `{ "name": string | null }`
- Purpose: update basic account fields currently exposed by the learner profile (`display name`)
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`

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

### `GET /api/users/me/research-consent`
- Auth: required
- Purpose: current research-consent and future-training eligibility snapshot
- Response:
  - `consentGranted`, `consentVersion`, `consentGrantedAtIso`
  - `consentWithdrawnAtIso`
  - `futureTrainingEligible`, `excludedFromFutureTraining`
  - `excludedFromFutureTrainingAtIso`, `exclusionReason`

### `PATCH /api/users/me/research-consent`
- Auth: required
- Request: `{ "consented": boolean }`
- Behavior:
  - `true` restores research consent and future-training eligibility unless another exclusion reason is still active
  - `false` withdraws consent and explicitly excludes future training/export use going forward
  - does not perform physical deletion of operational history
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`

### `PATCH /api/users/me/preferences`
- Auth: required
- Request: declared-preference map `{ [axisKey]: tagKey }`
- Supported learner-editable keys in the main profile: `difficulty_target`, `depth`, `tone`, `explanation_style`
- Additional legacy compatible keys may still be stored if already present in declared preferences
- Constraints: active `response_format` support is `mcq` only
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`, `UNSUPPORTED_FEATURE`

### `POST /api/users/me/preferences/apply`
- Auth: required
- Purpose: copy effective -> declared
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`

### `GET /api/users/me/predictions`
- Auth: required
- Query: `subjectId` optional
- Purpose: expected accuracy/time + next difficulty + chat engagement prediction
- Runtime selection: legacy accuracy/time prediction loaded from `configs/active_policy.json`; it is not the primary six-factor pedagogical policy for new episode/chat decisions.
- Current config shape:
  - `version = prediction_runtime_config_v1_2026_03`
  - `policyId = prediction_runtime_v1_2026_03`
  - optional `compatibilityRole = legacy_accuracy_runtime_not_primary_pedagogical_policy`
  - `backend.kind = heuristic_baseline | stub_model | artifact_ml`
  - `backend.heuristicPolicyId = v1_accuracy_raw_duration_baseline | v2_accuracy_beta_duration_unified` when `backend.kind=heuristic_baseline`
  - optional `backend.artifactPath` when `backend.kind=artifact_ml`
- Response includes:
  - `forTests.predictionPolicyId`
  - `forTests.predictionRuntime`
  - per-target metadata with `status` and source information
- No hidden artifact fallback:
  - if configured `artifact_ml` backend has no valid artifact, `expectedAccuracy.status = unavailable` and `expectedAccuracy.value = null`
  - duration prediction still uses the shared heuristic duration path
- Readiness diagnostics expose `backendKind`, artifact path, artifact status, artifact schema version, and model version without secrets.
  - if active policy is `artifact_ml` and the artifact is missing or invalid, readiness reports an error rather than a quiet warning
  - if active policy is an explicit heuristic fallback, readiness marks accuracy ML-first as blocked but does not call the heuristic backend ML
  - six-factor diagnostics separately expose artifact path/status/schema/model and keep synthetic/bootstrap provenance warnings visible
- Duration contract:
  - default runtime path uses unified predictor `v3_duration_unified_2026_02`
  - heuristic V1 keeps explicit baseline-only duration for comparison mode
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
    - logged prediction meta (if present): `predictedAccuracy`, `predictedTotalDurationMs`, `durationConfidence`, `durationBasis`, `policyId` (runtime policy id), `predictorVersion` (duration producer id)
    - pedagogy hints: `difficulty.{current,next,changed,reason}`
    - gating hint: `learningEligible`
  - `summary`: availability flags for predicted accuracy/duration
- Errors: `AUTH_REQUIRED`

## Tests and Learning Pipeline

### `POST /api/evaluation/episodes`
- Auth: required
- Purpose: start a structured MVP learning episode and immediately materialize the first step
- Request:
  - `subjectId`, `topic`
  - optional `sectionId`, `questionCount`, `mode`, `personalizationMode`, `clientKey`
  - optional episode controls: `assignmentArm`, `conceptKey`, `skillKey`, `familyKey`
  - optional sequencing controls: `includeHoldout`, `holdoutStrategy`, `delayedRecheckMinutes`, `expectedSequenceRoles`
- Behavior:
  - resolves one episode-level assignment arm
  - locks one orchestration package with shared pedagogical decision plus surface-specific rendering materialization
  - creates/reuses a structured evaluation episode (`learning_gain_episode_v1`)
  - if `clientKey` is replayed with the same episode intent, returns the same episode instead of creating a duplicate
  - materializes the first missing step, typically `precheck`
- Response:
  - `{ episode, currentStep }`
  - `episode` is the same summary shape used by episode export
  - `currentStep` contains either a sanitized generated test or a structured learning-content payload
- Errors: `AUTH_REQUIRED`, `INVALID_INPUT`, `INVALID_EVALUATION_ASSIGNMENT`, `INVALID_EVALUATION_EPISODE`

### `GET /api/evaluation/episodes`
- Auth: required
- Purpose: current-user episode list for the researcher/operator control surface
- Query:
  - `limit` optional (`1..100`, default `20`)
  - `subjectId` optional
  - `status=active|completed` optional
- Response:
  - `{ episodes: [...] }`
  - each row includes:
    - identity/linkage: `episodeId`, `subject.{id,title}`, `section.{id,title}`, `topic`, `conceptKey`, `skillKey`
    - assignment/provenance: `arm`, `provenance.{assignmentSource,selectionMode,personalizationMode,policyMode,policyId,runtimePolicyId,backendKind,backendId}`
    - locked decision summary: `selectedPedagogicalDecision.{difficulty,depth}`
    - progression summary: `status`, `counts`, `sequence.{expected,completed,missing,nextExpectedRole}`
    - export/evaluation readiness: `exportReadiness.{ready,code}`
- Notes:
  - the route is still user-scoped; `/admin/episodes` uses it as an operator view for the current admin user's workspace instead of exposing cross-user management
  - `backendKind=heuristic_baseline` and `backendKind=stub_model` must be interpreted as non-ML provenance
- Errors: `AUTH_REQUIRED`, `INVALID_INPUT`

### `POST /api/evaluation/episodes/[id]/next`
- Auth: required
- Purpose: advance the structured episode to the next step
- Request:
  - optional `{ acknowledgeLearningContent?: boolean }`
- Behavior:
  - if the current step is an unsubmitted test, returns that test again as the active step
  - if the current step is `learning_content`, requires explicit acknowledgement before materializing the next test step
  - materializes `postcheck`, `holdout`, and `delayed_recheck` when the protocol says they are due
  - repeated/replayed advancement calls reuse the same step state instead of writing duplicate sequence-role items
- Response: `{ episode, currentStep }`
- Errors: `AUTH_REQUIRED`, `NOT_FOUND`, `INVALID_INPUT`, `INVALID_EVALUATION_EPISODE`

### `GET /api/evaluation/episodes/[id]`
- Auth: required
- Purpose: machine-readable inspection of episode state/progression without a dashboard
- Response: `{ episode, currentStep }`
- Notes:
  - `episode` contains counts, observed/completed sequence roles, and outcome summary
  - `currentStep` can be `awaiting_test_submission`, `acknowledge_learning_content`, `pending_materialization`, `waiting_delay`, or `completed`
  - when `currentStep.contentKind === "chat_session"`, `currentStep.learningContent` now includes the structured guide plus `dialogueThread`, `dialogueBudget`, and `pedagogicalContext` for the active `Learn` dialogue loop
  - the active learner-facing `/learn` UI uses this endpoint to restore the current episode after reload/navigation
- Errors: `AUTH_REQUIRED`, `NOT_FOUND`, `INVALID_EVALUATION_EPISODE`

### `POST /api/evaluation/episodes/[id]/dialogue`
- Auth: required
- Purpose: append one learner/system turn pair to the current `learning_content` step inside `Learn`
- Request:
  - `{ message: string }`
- Behavior:
  - available only while the current episode step is `learning_content`
  - reuses the existing episode-linked `chat_session` instead of creating a separate top-level chat surface
  - keeps the reply scoped to the current episode topic/guide/pedagogical settings
  - rate limiting: external route-class limiter (`chat_turn`) with per-user and per-IP minute windows
  - stores learner/system turns on the same session and returns the refreshed episode state
  - dialogue is bounded by an episode-step learner-turn limit; checks remain the primary learning signal
- Response: `{ episode, currentStep }`
- Errors: `AUTH_REQUIRED`, `NOT_FOUND`, `INVALID_INPUT`, `INVALID_EPISODE_STEP`, `DIALOGUE_TURN_LIMIT_REACHED`, `INVALID_EVALUATION_EPISODE`

### Learner-facing MVP integration
- `/learn` is the active learner route.
- The page starts episodes with `POST /api/evaluation/episodes`, restores state with `GET /api/evaluation/episodes/[id]`, continues multi-turn learning dialogue with `POST /api/evaluation/episodes/[id]/dialogue`, advances with `POST /api/evaluation/episodes/[id]/next`, and records test outcomes with `POST /api/tests/[id]/submit`.
- `/learn` also restores the latest active episode via `GET /api/evaluation/episodes?status=active&limit=1` when local client state is missing after refresh/return.
- `/practice` is the canonical public practice entry (`Core` + `Custom`), while `/tests/[id]` remains the custom-practice runner only.

### Researcher/operator MVP integration
- `/admin/episodes` is the minimal operator-facing control surface.
- The page uses:
  - `GET /api/subjects`
  - `POST /api/subjects`
  - `GET /api/subjects/[subjectId]/sections`
  - `POST /api/subjects/[subjectId]/sections`
  - `GET /api/evaluation/episodes`
  - `POST /api/evaluation/episodes`
  - `GET /api/evaluation/episodes/[id]`
- The page does not implement a second orchestration path.
- It reuses the same episode coordinator and only adds operator-friendly launch/list/inspection affordances.

### `POST /api/tests/generate`
- Auth: required
- Request (core):
  - `subjectId`, `topic`, `questionCount`, `mode`
  - optional `sectionId`, `delivery`, `personalizationMode`
  - optional `evaluation`:
    - episode linkage: `episodeId`, `protocolKey`
    - sequencing metadata: `touchpointType`, `sequenceRole`, `expectedTouchpoints`, `expectedSequenceRoles`
    - assignment metadata: `assignmentArm`
    - practice-effect metadata: `itemRole`, `itemVariant`, `linkageKind`, `linkedContentId`, `holdoutStrategy`, `familyKey`, `delayedMinutes`
    - instructional scope: `conceptKey`, `skillKey`
- Delivery constraint: active `response_format` support is `mcq` only
- Behavior:
  - policy-arm resolution with explicit runtime path support for `baseline`, `self_report`, `predicted`, and `manual_override`
  - when `evaluation` is present, generation now uses a structured episode generation package instead of only free-form prompt glue
  - LLM generation + fallback
  - LLM tagging diagnostics + rule fallback
  - UX compliance + bounded retries
  - create/reuse of an evaluation episode
  - register the generated test as an explicit evaluation episode item with sequence/linkage metadata
  - stores compact evaluation provenance in `validationMetaJson.evaluation`
  - links the generated test to the evaluation episode when provided
  - saves metadata in `validationMetaJson`
  - rate limiting: external route-class limiter (`test_generate`) with per-user and per-IP minute windows
- Response: `{ id, test: { title, questions[] } }`
- Contract: outbound `questions[]` is sanitized and never includes `answerIndex`
- Errors: `UNAUTHORIZED`, `INVALID_INPUT`, `INVALID_EVALUATION_ASSIGNMENT`, `INVALID_EVALUATION_EPISODE`, `UNSUPPORTED_FEATURE`, `RATE_LIMITED`

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
  - prediction logging uses the legacy accuracy/time runtime backend selection from `configs/active_policy.json`
  - `_meta.prediction.policyId` stores the active runtime policy id
  - `_meta.prediction.runtime` stores backend kind, backend id, feature/artifact metadata, and explicit artifact state
  - `_meta.prediction.targets.*` stores per-target status and source metadata
  - `_meta.evaluation` stores the linked episode/touchpoint/item metadata for later comparison across policy arms and holdout strategies
  - submit-time recording also updates the linked `EvaluationEpisodeItem.outcomeJson`
  - tests remain the primary learning-evaluation signal even when related chat support exists
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
  - optional `context`: `{ subjectId?, subjectTitle?, sectionId?, sectionPath?, topic?, conceptKey?, skillKey?, familyKey? }`
  - optional `evaluation` with the same episode/assignment/sequence/linkage fields as `POST /api/tests/generate`
- Behavior:
  - applies baseline, self-report, or six-factor predicted runtime path before rendering the chat response
  - validates `context.subjectId` ownership when it is provided
  - by default, pre-decision learner-state aggregates are used for six-factor selection/logging, but raw aggregate fields are not printed into the chat prompt; when apply is enabled, the prompt receives a clean six-factor pedagogical profile/instruction block
  - when the six-factor ML policy is enabled, `pedagogicalDecision.{difficulty,depth}` is a compatibility projection; `sixFactorPersonalization.selected_config` is the full six-factor learner-facing view
  - rate limiting: external route-class limiter (`chat_turn`) with per-user and per-IP minute windows
  - optional create/reuse of an evaluation episode
  - registers the chat session as a secondary-support evaluation episode item when evaluation is requested
  - stores chat signals
  - marks chat telemetry as `secondary_chat_support`
  - updates UX stats with weak reward proxy
- Response: `{ reply, meta: { policyMode, policyId, uxPreset, pedagogicalDecision, evaluationSignal, sixFactorPersonalization?, signalsStored } }`
  - `sixFactorPersonalization` is a safe learner-facing summary when six-factor metadata exists. It includes `selected_config`, `decisionSource`, `fallbackUsed`, `artifactVersion`, `backendKind`, `candidateCount`, `appliedToLearnerFacingOutput`, `appliedPromptInstructionCount`, and `appliedPath`; it does not expose raw feature snapshots, warnings, or debug JSON.
- Errors: `AUTH_REQUIRED`, `INVALID_INPUT`, `INVALID_EVALUATION_ASSIGNMENT`, `INVALID_EVALUATION_EPISODE`, `LLM_BAD_RESPONSE`, `INTERNAL_ERROR`

### Episode step semantics
- `learning_content` is now a first-class episode role, not an out-of-band helper function.
- The coordinator materializes learning content as a structured explanation plus bounded episode-local dialogue loop inside the same evaluation episode contract.
- Follow-up learner questions stay on the same episode-linked `chat_session`; `/chat` does not return as the canonical learner route.
- `/learn` episode state may include `learningContent.mlPersonalization` and assistant dialogue message `mlPersonalization` fields. The UI shows them only when `NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1`.
- New predicted episode steps store full six-factor delivered metadata in `decisionRuntimeJson.sixFactorDeliveredConfig`; stored `pedagogicalDecisionJson` may still expose `difficulty/depth`, but it is marked as a derived compatibility projection when six-factor metadata exists.
- Tests remain the primary learning signal; the learning-content/chat step is logged only as secondary/supporting evidence.

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
- `GET /api/admin/operational-summary`
- `GET /api/admin/audit-events`
- `GET /api/admin/data-quality-metrics`
- `GET /api/admin/personalization-metrics`
- `GET /api/admin/prediction-metrics`
- `GET /api/admin/prediction-backtest`
- `GET /api/admin/prediction-calibration`
- `GET /api/admin/dataset-export`
- `GET /api/admin/evaluation-export`

### `GET /api/admin/evaluation-export`
- Auth: admin required
- Query params:
  - optional `timeRangeDays`
  - optional `maxEpisodes`
  - optional `format=jsonl|json` (default `jsonl`)
- Behavior:
  - exports episode-level evaluation summaries
  - includes assigned arm, episode design, item sequencing, practice-effect linkage, timing, and test outcomes
  - protected by external admin export rate limiting
  - writes operator audit trail entries on export attempts
  - intended for offline learning-gain analysis rather than UI consumption
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
- Purpose: anonymized export for offline heuristic-vs-ML training/evaluation/backtesting
- Query:
  - `timeRangeDays` (default `30`)
  - `maxAttempts` (default `5000`)
  - `eligibleOnly=1|0` (default `1`)
  - `consentOnly=1|0` (default `1`)
  - `format=jsonl|csv` (default `jsonl`)
- Privacy:
  - user and subject are exported as stable HMAC pseudonyms (`userKey`, `subjectKey`)
  - no `email`, `name`, raw chat text, prompt text, or raw answer payload
- Eligibility semantics:
  - `consentOnly=1` means future-training eligible only
  - withdrawn/excluded learners stay in operational history but are excluded from future-training export
  - exported rows include `consentWithdrawnAtIso`, `futureTrainingEligible`, `excludedFromFutureTraining`, `excludedFromFutureTrainingAtIso`, and `trainingExclusionReason`
- Labels:
  - `actualAccuracy`
  - `actualTotalDurationMs`
- Evaluation provenance:
  - includes episode/protocol/arm fields plus touchpoint, sequence-role, linkage, and item-variant metadata when present
  - allows downstream analysis to separate direct repetition from holdout or delayed checks
- Leakage control:
  - feature values for row `i` are computed from attempts strictly earlier than `i`
- Typical downstream use:
  - `npm run ml-accuracy:train`
  - `npm run ml-accuracy:eval`

### Prompt templates
- `GET /api/admin/prompt-templates`
- `POST /api/admin/prompt-templates`
- `GET /api/admin/prompt-templates/[id]`
- `PATCH /api/admin/prompt-templates/[id]`
- `POST /api/admin/prompt-templates/[id]/activate`
- Mutation routes are protected by the external admin mutation rate limiter and write operator audit trail entries.

### `GET /api/admin/operational-summary`
- Auth: admin required
- Purpose: operational minimum snapshot for runtime mode, readiness, export visibility, consent/exclusion counts, artifact slot state, and recent dangerous actions

### `GET /api/admin/audit-events`
- Auth: admin required
- Query: optional `limit` (`1..100`, default `20`)
- Purpose: recent dangerous operator actions with actor, target, result, summary payload, timestamp, and IP

## Curl examples

```bash
# login
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"identifier":"student@example.com","password":"strong-pass-123"}'
```

```bash
# register
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"student@example.com","password":"strong-pass-123","name":"student"}'
```

```bash
# generate test (personalized)
curl -X POST http://localhost:3000/api/tests/generate \
  -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"subjectId":"SUBJECT_ID","topic":"Cell structure","questionCount":5,"mode":"practice","personalizationMode":"on"}'
```

```bash
# submit test with telemetry
curl -X POST http://localhost:3000/api/tests/TEST_ID/submit \
  -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"answers":[0,1,2,3,0],"totalDurationMs":98000,"perQuestionFirstAnswerMs":[10000,19000,32000,51000,73000],"answerChangeCount":2}'
```

```bash
# chat (standard mode)
curl -X POST http://localhost:3000/api/chat \
  -b cookies.txt \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Explain osmosis"}],"personalizationMode":"off"}'
```

```bash
# admin prediction metrics
curl 'http://localhost:3000/api/admin/prediction-metrics?window=30d&policyMode=any' \
  -b admin-cookies.txt
```
