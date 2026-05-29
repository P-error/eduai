# Prompt Materialization Refactor Report

Дата: 2026-05-19

## Что изменено

- Добавлен `src/lib/prompt-materialization.ts`: внутренние `LearningContentGenerationPackage` и `TestGenerationPackage` теперь преобразуются в sanitized external task packages перед отправкой во внешнюю LLM.
- `buildLearningContentPrompt` и `buildTestGenerationPrompt` больше не сериализуют полный internal `generationPackage`.
- Six-factor render mapping теперь строит цельный pedagogical profile: summary, factor guidance и path-specific constraints.
- Six-factor apply block очищен от raw learner-state aggregates, feature refs, backend/artifact/candidate diagnostics и policy/linkage details.
- Chat и episode dialogue больше не передают raw learner-state aggregate block во внешний prompt.
- `learning_content_card` validation для `examples_level=single` теперь проверяет структуру: один `sections[].heading === "One example:"`, а не count слова `example` по всему тексту.
- Prompt audit обновлён под новую архитектуру: проверяет presence шести факторов, absence internal-only fields, apply-disabled, shadow-only и metadata integrity.

## Какие external prompt fields теперь передаются LLM

Learning content получает:

- `task: "generate_learning_content_card"`
- `outputContract`: `kind`, `schemaVersion`, `returnJsonOnly`, `noMarkdown`, `sectionsCount`
- `learningContext`: `subjectTitle`, `sectionPath`, `topic`, `conceptKey`, `skillKey`, summary `priorTestOutcome`
- `pedagogicalProfile`: six-factor profile summary, factor guidance, path-specific requirements, safety/precedence
- `constraints`: no invented context, topic boundary, schema-over-style precedence

Test generation получает:

- `task: "generate_mcq_test"`
- `outputContract`: `kind`, `schema`, `questionCount`, `mode`, JSON-only/no-markdown/MCQ preservation
- `learningContext`: `subjectTitle`, `sectionPath`, `topic`, `conceptKey`, `skillKey`
- `pedagogicalProfile`: six-factor profile summary, factor guidance, test-specific constraints
- `constraints`: no extra keys, fixed question count, `answerIndex` contract, support/examples only inside prompt/explanation fields

Chat получает learner-facing clean six-factor profile block when apply is enabled; JSON is not required for chat.

## Какие internal fields больше не передаются LLM

External prompts no longer include:

- `episodeId`, `protocolKey`
- `policyId`, `assignmentSource`
- `rulesLayer`, `linkedContentId`, `holdoutStrategy`
- `backendKind`, `artifactPath`, `candidateCount`
- `featuresSnapshot`, `featureRefs`
- raw `userRef`, `sessionRef`, `contentEventRef`
- raw learner-state aggregate field dumps such as prior/recent rates, attempt counts, topic counts, recency, and session position

Эти данные остаются во внутренних metadata/logs, включая `sixFactorShadow` и `sixFactorDeliveredConfig`.

## Как шесть факторов теперь превращаются в prompt

`src/lib/ml-six-factor-render-mapping.ts` normalizes the selected six-factor decision and builds:

- compact `profileSummary`
- visible factor guidance for `difficulty`, `depth`, `support_level`, `presentation_format`, `examples_level`, `terminology_level`
- path-specific requirements for `chat`, `learning_content`, and `test_generation`
- safety/precedence rules that keep JSON schemas, MCQ structure, `answerIndex`, and topic boundaries above style personalization

`examples_level=single` is structural for learning content: one section heading exactly `One example:`. The prompt no longer asks the model to count the word `example` across the whole card.

## Tests and commands run

Passed:

- `npx tsc --noEmit`
- `bash scripts/audit-llm-prompts.sh`
- `bash scripts/llm-generation-validation-self-check.sh`
- `npm run lint`
- `npm run build`
- `npm run ml-six-factor:self-check`
- `npm run learning-episode:self-check` after starting local DB
- `npm run learning-quality-gate:self-check`
- `npm run learner-orchestration:self-check`
- `npm run pilot-readiness:smoke`
- `docker compose ps`
- `psql ... -c "select 1"` with sanitized local DB URL
- `git diff --check`

Failed or limited:

- First `npm run learning-episode:self-check` failed before DB startup: PostgreSQL at `localhost:5432` was unavailable.
- `npx prisma validate` failed because `DIRECT_URL` is missing in `.env`. `DATABASE_URL` is present and DB connectivity passed; secret values were not printed.
- A first manual shell-source attempt for `psql` failed because sourcing `.env` executed non-shell content and `psql` rejected Prisma's `?schema=` query parameter. A sanitized Node-based retry stripped the query parameter and passed.

## Risks

- Existing live-provider behavior still depends on the LLM obeying the new structural prompt; validation and repair remain the enforcement layer.
- `DIRECT_URL` missing blocks `npx prisma validate` in this local environment.
- Internal metadata remains intentionally full; leakage protection depends on prompt builders continuing to use the sanitized external package boundary.

## Diff summary

Key changed runtime modules:

- `src/lib/prompt-materialization.ts`
- `src/lib/episode-generation.ts`
- `src/lib/ml-six-factor-render-mapping.ts`
- `src/lib/ml-six-factor-apply.ts`
- `src/lib/learning-content-schema.ts`
- `src/lib/llm-prompt-builders.ts`
- `src/app/api/chat/route.ts`
- `src/lib/learning-dialogue.ts`
- `src/lib/learning-content-generation.ts`
- `src/lib/test-generation.ts`

Key changed validation/audit/docs:

- `scripts/audit-llm-prompts.ts`
- `src/lib/ml-six-factor-shadow-self-check.ts`
- `src/lib/llm-generation-validation-self-check.ts`
- `docs/llm_prompt_inventory.md`
- `docs/llm_prompt_strictness_rules.md`
- `docs/llm_prompt_compliance_check.md`
- `docs/API_REFERENCE.md`
- `docs/ml_six_factor_apply_mode.md`
- `docs/ml_six_factor_runtime_policy_adapter.md`
