# EduAI Context Seed (Canonical, v2)

## 1) Project summary
EduAI is a thesis-oriented educational personalization prototype (not a commercial product) built on Next.js App Router + Prisma/PostgreSQL + OpenAI-compatible LLM calls. The system focuses on transparent adaptation quality: test generation, chat learning support, profile/prediction proxies, and admin-side calibration/data-quality observability.

## 2) Current user-facing system
- Learn (`/learn`): educational chat with `Personalized` or `Standard` mode.
- Practice (`/practice`): generate tests and run attempts.
- Profile (`/profile`): UX/pedagogy preferences with confidence and limitations.
- Insights (`/insights`): prediction and calibration summary for user understanding.
- Admin (`/admin/*`): high-density dashboards for quality, personalization, predictions, chat, and tests.
- Redirects:
  - `/chat` -> `/learn`
  - `/tests` -> `/practice`
  - `/tests/create` -> `/practice`

## 3) Architecture map (modules and responsibilities)
- `src/app/api/tests/generate/route.ts`: generation pipeline, provenance metadata, UX compliance/retries.
- `src/app/api/tests/[id]/submit/route.ts`: strict submission validation, scoring, telemetry, learning gating, updates.
- `src/app/api/chat/route.ts`: chat orchestration with UX presets and signal logging.
- `src/lib/recommendation.ts`: baseline/personalized presets, pedagogy exploration.
- `src/lib/statistics.ts`: uxReward math, difficulty band decisions, effective preference recomputation.
- `src/lib/prediction.ts`: user prediction proxies.
- `src/lib/prediction-metrics.ts`: calibration aggregation (MAE/RMSE/bias/buckets).
- `src/lib/admin-observability.ts`: admin aggregates (quality/personalization/chat/tests).
- `src/lib/llm-tagger.ts` + `src/lib/tagger.ts`: LLM tagging diagnostics + rule fallback.
- `src/lib/llm/provider.ts`: all LLM calls.
- `src/lib/auth.ts`: JWT user extraction and admin gating.

## 4) Data model summary
Prisma models: `User`, `Collection`, `Subject`, `SubjectSection`, `GeneratedTest`, `TestAttempt`, `TagAxis`, `Tag`, `TagAssignment`, `UserTagStat`, `ChatSession`, `ChatMessage`, `PromptTemplate`.

Key JSON contracts:
- `GeneratedTest.validationMetaJson`:
  - `schemaVersion`, `generationSource`, `generationError`
  - `taggingSource`, `taggingWarnings`, fallback counters
  - `learningEligible`, `learningExcludedReason`
  - `requestedDelivery`, `appliedDelivery`, `deliveryCompliance`, `deliveryComplianceFailed`
  - `policyMode`, `policyId`, `policyMeta`
- `TestAttempt.byTagJson._meta`:
  - `learning`, `ux`, `pedagogy`, `recommendation`, `policy`, `prediction`
  - prediction block stores expected vs actual.
- `ChatMessage.signalsJson`:
  - policy mode/id, UX preset, message stats, chat reward/update metadata.

## 5) v2 personalization model
- UX axes: `tone`, `explanation_style`, `response_format`.
- Pedagogy axes: `difficulty_target`, `cognitive_process`, `task_family`, `context`.
- Policy modes in generate:
  - `personalization_on`, `personalization_off`, `manual_delivery_override`.
- Baseline preset is deterministic (formal/stepwise/mcq + medium/apply/problem_solving/abstract).

Compliance and retries:
- UX compliance uses requested UX vs observed per-question final tags.
- Thresholds:
  - avg >= `0.60`
  - min-axis >= `0.50`
- bounded retries: `MAX_RETRIES=2`.
- retries only if tagging source is strictly `llm` (no mixed/fallback loop).

## 6) Chat integration
- Chat uses the same personalization mode semantics (`on/off`) as tests.
- UX preset applied to system prompt (tone + explanation style; response_format treated as structured style hint, not literal MCQ).
- Signals used: user/assistant char lengths, latency, weak uxReward proxy.
- Pedagogy stats are NOT updated from chat in current scope.
- Raw chat content storage is OFF by default; redacted placeholders stored unless `CHAT_STORE_RAW_CONTENT=1`.

## 7) Prediction layer state
- `GET /api/users/me/predictions` returns:
  - recommended preset snapshot
  - predicted expected accuracy/time with confidence and basis
  - next difficulty suggestion
  - predicted chat engagement proxy
- Heuristics:
  - expectedAccuracy = recent accuracy +/- 0.07 by difficulty.
  - expectedDuration from telemetry average or baseline table.
  - confidence is sample-size based (`clamp(sample/20, 0, 1)`).
- Submit logs predicted and actual values in `byTagJson._meta.prediction`.

## 8) Admin evaluation state
- Prediction metrics endpoint: `/api/admin/prediction-metrics`.
- Additional observability endpoints:
  - `/api/admin/data-quality-metrics`
  - `/api/admin/personalization-metrics`
  - `/api/admin/chat-metrics`
  - `/api/admin/tests-metrics`
- Filters: `window`, `policyMode`, `subjectId`, `includeExcluded`.
- Calibration outputs: MAE, RMSE, bias, over/under rates, calibration buckets, by-policy breakdown.
- Attempt scan cap in prediction metrics: 2000.

## 9) Critical invariants
- No silent acceptance of invalid LLM tags in LLM tagger diagnostics (invalid question tags force fallback).
- No learning updates from fallback/mixed/low-compliance conditions.
- Tests are effectively MCQ-only in current prototype (`response_format` non-mcq rejected in preferences/generate).
- Chat raw content is redacted by default.
- Submit route enforces ownership and one-attempt policy (best-effort race guard without DB unique index).

## 10) Next roadmap priorities
- Add owner-gated read protection for `/tests/[id]` page.
- Align UX taxonomy with runtime (`response_format` support vs constraints).
- Improve per-question compliance evidence for audit.
- Add explicit retention/deletion controls.
- Improve admin visualization layer while keeping same metrics.
- Add exportable analysis bundles for thesis appendix.

## 11) Canonical docs links
- `README.md`
- `docs/INDEX.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/AXIS_SCHEMA_V2.md`
- `docs/LEARNING_POLICY_V2.md`
- `docs/API_REFERENCE.md`
- `docs/PREDICTION_LAYER.md`
- `docs/ADMIN_OBSERVABILITY.md`
- `docs/UX_INFORMATION_ARCHITECTURE.md`
- `docs/LIMITATIONS_ETHICS.md`
- `docs/REPRODUCIBILITY.md`
