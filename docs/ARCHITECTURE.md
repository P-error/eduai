# Architecture

EduAI is a Next.js App Router app with Prisma/PostgreSQL, an OpenAI-compatible LLM provider, and JWT auth.
Protected APIs use Bearer JWT; SSR ownership checks can also use JWT cookie (`eduai_token`).
The core logic is split into UX personalization, pedagogy personalization, prediction proxies, and admin observability.
Public pilot controls add:
- explicit research consent (`User.researchConsentAt`, `User.researchConsentVersion`);
- endpoint rate limits for auth/generate/submit (`src/lib/rate-limit.ts`);
- configurable active prediction policy (`configs/active_policy.json`);
- admin-only anonymized dataset export (`GET /api/admin/dataset-export`).

## Component Map

```mermaid
flowchart LR
  U[User UI: Learn/Practice/Profile/Insights] --> API[Next.js API routes]
  A[Admin UI: /admin/*] --> API

  API --> AUTH[src/lib/auth.ts]
  API --> REC[src/lib/recommendation.ts]
  API --> STATS[src/lib/statistics.ts]
  API --> PRED[src/lib/prediction.ts]
  API --> PDUR[src/lib/prediction-duration.ts]
  API --> PM[src/lib/prediction-metrics.ts]
  API --> CHAT[src/lib/chat.ts]
  API --> TAG1[src/lib/llm-tagger.ts]
  API --> TAG2[src/lib/tagger.ts]
  API --> LLM[src/lib/llm/provider.ts]
  API --> DB[(PostgreSQL via Prisma)]

  DB --> T1[GeneratedTest/TestAttempt]
  DB --> T2[TagAxis/Tag/TagAssignment/UserTagStat]
  DB --> T3[ChatSession/ChatMessage]
  DB --> T4[Subject/Section/Collection]
```

## Generate Test Dataflow

```mermaid
sequenceDiagram
  participant UI as Practice UI
  participant API as POST /api/tests/generate
  participant REC as Recommendation logic
  participant LLM as LLM provider
  participant TAG as LLM Tagger + Rule Fallback
  participant DB as Prisma/Postgres

  UI->>API: subject/topic/count/mode + personalizationMode (+optional delivery)
  API->>REC: resolve baseline/personalized/manual policy
  API->>LLM: generate JSON test
  alt LLM failure or invalid output
    API->>API: fallback test
  end
  API->>TAG: tag questions (LLM diagnostics)
  alt invalid/missing tags
    API->>TAG: rule fallback per-question
  end
  API->>API: compute UX compliance on final observed tags
  alt compliance fail AND taggingSource=llm AND retry budget remains
    API->>LLM: retry with strict delivery reinforcement
  end
  API->>DB: save GeneratedTest + validationMetaJson + TagAssignment
  API-->>UI: test id + sanitized questions (without answer keys)
```

## Submit Dataflow

```mermaid
sequenceDiagram
  participant UI as Test Runner UI
  participant API as POST /api/tests/[id]/submit
  participant STATS as statistics.ts
  participant DB as Prisma/Postgres

  UI->>API: answers + telemetry
  API->>DB: load test + assignments + metadata
  API->>API: strict payload validation
  API->>API: ownership check + idempotent replay check
  API->>API: score + byTag + policy meta
  API->>STATS: uxReward + difficulty decision
  API->>DB: write TestAttempt (unique userId+testId)
  alt learning eligible
    API->>DB: update UserTagStat + effectivePreferences
  else learning gated
    API->>DB: skip updates, keep attempt only
  end
  API-->>UI: score + byTag + additive meta
```

## Chat Dataflow

```mermaid
sequenceDiagram
  participant UI as Learn UI
  participant API as POST /api/chat
  participant REC as recommendation.ts
  participant LLM as LLM provider
  participant CHAT as chat.ts
  participant DB as Prisma/Postgres

  UI->>API: messages + personalizationMode
  API->>REC: resolve UX preset (personalized or baseline)
  API->>LLM: chat completion with UX constraints
  API->>CHAT: compute weak UX reward proxy
  API->>CHAT: apply UX stat updates (tone/style only)
  API->>DB: store chat event/messages (raw redacted by default)
  API-->>UI: reply + policy metadata
```

## Prediction + Evaluation

```mermaid
flowchart TD
  ATT[TestAttempt + meta.prediction/.actual] --> PM[prediction-metrics aggregation]
  PROF[profile aggregation] --> PRED[prediction heuristics]
  REC[recommendation preset] --> PRED
  PRED --> UINS[User Insights /profile,/insights]
  PM --> ADMIN[/admin/predictions + API]
```

## Layer Separation

- UX layer: `tone`, `explanation_style`, `response_format` (with `mcq` enforced in tests).
- Pedagogy layer: `difficulty_target`, `cognitive_process`, `task_family`, `context`.
- Prediction layer: expected accuracy/time and next difficulty suggestion (heuristics).
- Duration prediction uses one shared pipeline (`predictExpectedTotalDurationMsUnified`) for UI and submit logging.
- Admin layer: quality/calibration/usage aggregates only, no raw educational content exposed.
- Answer keys remain server-side in `GeneratedTest.questionsJson`; all client-facing payloads are sanitized.
