# Repo Audit Index: EduAI

Дата среза: `2026-04-03`

Основа среза:
- Индекс отражает текущее состояние файловой системы/worktree, а не обязательно чистый `git HEAD`.
- Обзор выполнен без изменения кода; созданы только audit-артефакты.
- При конфликте между старой документацией и текущим кодом приоритет отдавался коду, затем `AGENTS.md`, `VISION.md`, `docs/RESEARCH_SPEC.md`.

## Проверка корректности задачи

Строгих противоречий, блокирующих выполнение, нет. Задача корректна, но для качественного review-pack есть несколько рисков и упущений:

1. Не задан точный состав будущего `review-pack`: только исходники и документы или ещё snapshot-артефакты, synthetic datasets, runtime slot, self-check outputs.
2. Репозиторий находится в активном переходе и в грязном worktree: есть незакоммиченные изменения, удалённые старые пути и новые route groups. Для внешнего аудита важно фиксировать, что индекс описывает именно текущее файловое состояние.
3. Есть параллельные runtime-пути: episode-first learner loop (`/learn` + `/api/evaluation/episodes`) и secondary custom-practice / standalone chat path (`/practice`, `/tests/[id]`, `/api/tests/*`, `/api/chat`). Без явной пометки аудитор может принять их за конкурирующие основные архитектуры.
4. В запросе есть мягкий конфликт формата финального вывода: пользователь хочет перечисление артефактов, а репозиторный `AGENTS.md` требует жёсткий 4-строчный CLI-ответ. Это разрешается в пользу `AGENTS.md`; подробности вынесены в markdown.
5. В репозитории присутствуют реальные `.env`-файлы. Их содержимое не читалось и не должно попадать в review-pack; максимум допустимы шаблоны `.env.example`/`.env.production.example`.

Ничего из этого не делает задачу невыполнимой. Ниже обзор выполнен максимально полно в рамках текущего состояния репозитория.

## Краткое резюме структуры репозитория

EduAI уже выглядит как research-oriented Next.js/Prisma система с явным смещением к episode-first learner loop и к воспроизводимому evaluation/export pipeline. Активный runtime собран вокруг `/learn`, `EvaluationEpisode`, `learning-episode.ts`, `recommendation.ts`, `personalization-runtime.ts` и prediction-модулей. При этом репозиторий ещё хранит переходные/вторичные контуры: standalone practice runner, отдельный `/api/chat`, redirect surfaces и deprecated endpoints.

С ML-переходом ситуация честная, но переходная: архитектурный каркас для prediction/evaluation/calibration/export уже есть, однако активная runtime-конфигурация в `configs/active_policy.json` сейчас указывает на `heuristic_baseline`, а EduAI-native artifact slot в `artifacts/runtime/eduai_native_pedagogy/current/` существует, но serving integration остаётся отложенной. Отдельно живут два offline-контура: внешний bootstrap workspace на ASSISTments и synthetic native bridge workspace.

## Тег-легенда

- `runtime-critical`: влияет на активный runtime-контур или его контракт.
- `state-mutation`: меняет БД/состояние/артефакты.
- `learner-facing`: напрямую формирует learner/admin UI или API surface.
- `data-pipeline`: участвует в сборе, экспорте, dataset lineage, provenance.
- `ml-tooling`: offline training/eval/calibration/backtest/synthetic tooling.
- `config`: декларативный контракт, политика, схема, обязательная документация.
- `legacy`: deprecated/redirect-only/вытесняемый путь.
- `ambiguous`: переходная зона, дубль, пустой след или конкурирующая реализация.

## Верхнеуровневые папки и назначение

| Путь | Назначение | Теги |
| --- | --- | --- |
| `src/` | Основной runtime: App Router, UI, API routes, prediction/evaluation/chat/test/data logic. | `runtime-critical`, `state-mutation`, `learner-facing`, `data-pipeline` |
| `prisma/` | Каноническая схема БД и миграции operational data model. | `runtime-critical`, `state-mutation`, `config` |
| `configs/` | Активная runtime-policy конфигурация. | `runtime-critical`, `config` |
| `docs/` | Канонические архитектурные, research и operational документы. | `config` |
| `scripts/` | Shell entrypoints для self-check/export/train/eval/smoke flows. | `data-pipeline`, `ml-tooling`, `config` |
| `bootstrap_training/` | Изолированные offline workspaces: внешний bootstrap и synthetic-native bridge. | `data-pipeline`, `ml-tooling` |
| `training_datasets/` | Экспортированные training snapshots по фазам `synthetic`/`real`. | `data-pipeline`, `ml-tooling` |
| `artifacts/runtime/` | Зарезервированный runtime artifact slot для native pedagogy serving handoff. | `data-pipeline`, `ml-tooling`, `config` |
| `public/` | Статические UI-ассеты; архитектурно вторично. | `learner-facing` |
| `ml/` | Сейчас не кодовая ML-ветка, а локальный scope guard через `AGENTS.md`. | `ambiguous` |
| `artifacts/ui-audit-20260402/` | Генерированные UI audit evidence/screenshot traces, не core source. | `legacy`, `ambiguous` |
| `codex-report/`, `eduai-clean/`, `test-results/`, `.logs/` | Локальные артефакты/вспомогательный шум; не нужны в audit-pack по умолчанию. | `legacy` |

## Критичные файлы и папки для будущего ML-transition аудита

| Путь | Почему критично | Теги |
| --- | --- | --- |
| `AGENTS.md` | Репозиторные инварианты, честность ML framing, report/delivery workflow. | `config` |
| `VISION.md` | Целевое product направление перехода от preference UI к ML-ready learning system. | `config` |
| `docs/RESEARCH_SPEC.md` | Главный research contract для dissertation framing. | `config` |
| `docs/ARCHITECTURE.md` | Текущее архитектурное описание runtime/evaluation/export layering. | `config` |
| `docs/PREDICTION_LAYER.md` | Честное разделение heuristic/stub/artifact-backed runtime. | `config` |
| `docs/DATA_MODEL.md` | Описание canonical operational schema и export contract. | `config` |
| `docs/TRAINING_DATASET_EXPORT.md` | Bridge between runtime data and future training snapshots. | `config`, `data-pipeline` |
| `configs/active_policy.json` | Фактическая активная runtime policy; сейчас heuristic baseline. | `runtime-critical`, `config` |
| `prisma/schema.prisma` | Каноническая operational data model и provenance tables. | `runtime-critical`, `state-mutation`, `config` |
| `src/lib/learning-episode.ts` | Episode coordinator: связывает decision, materialization, evaluation provenance и sequence. | `runtime-critical`, `state-mutation`, `learner-facing`, `data-pipeline` |
| `src/lib/evaluation.ts` | Контракт протокола, arms, sequence roles, datasetPhase/origin, export summaries. | `runtime-critical`, `state-mutation`, `data-pipeline`, `config` |
| `src/lib/personalization-runtime.ts` | Двухслойная materialization model (`difficulty/depth` -> rendering). | `runtime-critical`, `learner-facing`, `config` |
| `src/lib/prediction.ts` | User prediction assembly и честные runtime notes. | `runtime-critical`, `learner-facing` |
| `src/lib/prediction-runtime.ts` | Вычисление expected accuracy/duration из active backend. | `runtime-critical`, `config` |
| `src/lib/prediction-ml.ts` | Artifact-backed ML slot для outcome prediction, train/eval logic. | `data-pipeline`, `ml-tooling` |
| `src/lib/training-dataset.ts` | Canonical operational-to-training snapshot export. | `state-mutation`, `data-pipeline`, `ml-tooling` |
| `src/lib/dataset-export.ts` | Attempt-level dataset export и pseudonymous export lineage. | `state-mutation`, `data-pipeline`, `ml-tooling` |
| `bootstrap_training/assistments_2009_2010/` | Внешний bootstrap baseline workspace; не runtime, но важен для transition narrative. | `data-pipeline`, `ml-tooling` |
| `bootstrap_training/eduai_native_synthetic/` | Synthetic bridge training workspace и artifact handoff path. | `data-pipeline`, `ml-tooling` |
| `artifacts/runtime/eduai_native_pedagogy/current/` | Reserved serving handoff slot; ключевая boundary-точка для следующего этапа. | `config`, `ml-tooling`, `data-pipeline` |

## Active Runtime Path

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `src/app/(main)/learn/page.tsx` | Активная learner entrypoint на episode-first workflow. | `runtime-critical`, `learner-facing` |
| `src/components/learner/LearnerEpisodeWorkspace.tsx` | Главная learner orchestration UI: старт, restore, submit, continue, dialogue. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/lib/learner-episode-client.ts` | Клиентский контракт для episode API и local storage episode state. | `runtime-critical`, `learner-facing` |
| `src/app/api/evaluation/episodes/route.ts` | Создание и список evaluation episodes. | `runtime-critical`, `state-mutation` |
| `src/app/api/evaluation/episodes/[id]/route.ts` | Загрузка current episode state. | `runtime-critical`, `learner-facing` |
| `src/app/api/evaluation/episodes/[id]/next/route.ts` | Продвижение episode sequence и materialization next step. | `runtime-critical`, `state-mutation` |
| `src/app/api/evaluation/episodes/[id]/dialogue/route.ts` | Episode-bound learner dialogue поверх learning content step. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/lib/learning-episode.ts` | Core coordinator для sequence roles, locked decision package, materialization, hydration. | `runtime-critical`, `state-mutation`, `data-pipeline` |
| `src/lib/learning-content-generation.ts` | Генерация structured learning-content artifact и его evaluation linkage. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/lib/learning-dialogue.ts` | Episode-specific dialogue continuation с LLM/fallback и chat UX update. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/lib/recommendation.ts` | Subject-level recommendation bridge между runtime prediction и learner-facing materialization. | `runtime-critical`, `learner-facing` |
| `src/lib/prisma.ts` | Singleton Prisma boundary для всего runtime. | `runtime-critical`, `state-mutation` |

## Prediction / Personalization

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `configs/active_policy.json` | Текущая активная runtime policy: `heuristic_baseline` (`v2_accuracy_beta_duration_unified`). | `runtime-critical`, `config` |
| `src/lib/active-policy.ts` | Чтение/нормализация active runtime config и legacy mapping. | `runtime-critical`, `config` |
| `src/lib/prediction-contract.ts` | Низкоуровневый prediction runtime contract, schema versions, backend kinds. | `runtime-critical`, `config` |
| `src/lib/prediction-feature-layer.ts` | Replay-safe feature payload builder для runtime и offline ML path. | `runtime-critical`, `data-pipeline`, `ml-tooling` |
| `src/lib/prediction-runtime.ts` | Backend dispatcher: heuristic/stub/artifact ML. | `runtime-critical`, `config` |
| `src/lib/prediction.ts` | User-facing prediction assembly, disclaimers, next-difficulty suggestion. | `runtime-critical`, `learner-facing` |
| `src/lib/personalization-runtime.ts` | Narrow pedagogical decision contract (`difficulty`, `depth`) + rules-layer materialization. | `runtime-critical`, `learner-facing`, `config` |
| `src/lib/recommendation.ts` | Runtime preset assembly для tests/chat. | `runtime-critical`, `learner-facing` |
| `src/lib/prediction-params.ts` | Tunable baseline/calibration params stored in config file path. | `config`, `ml-tooling` |
| `src/lib/prediction-ml.ts` | Offline artifact training/loading/evaluation for accuracy slot. | `data-pipeline`, `ml-tooling` |
| `src/lib/model-artifact-slot.ts` | EduAI-native artifact slot metadata and handoff contract. | `config`, `ml-tooling`, `data-pipeline` |
| `src/app/api/users/me/predictions/route.ts` | Runtime predictions API used by learner surfaces. | `runtime-critical`, `learner-facing` |

## Chat

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `src/app/api/chat/route.ts` | Standalone chat endpoint with evaluation-aware metadata and preset selection. | `state-mutation`, `learner-facing`, `ambiguous` |
| `src/lib/chat.ts` | Chat storage, redaction, UX reward, message/session helpers. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/lib/prompts.ts` | Prompt template persistence and activation. | `state-mutation`, `config` |
| `src/lib/llm/provider.ts` | Единственный LLM provider boundary. | `runtime-critical`, `config` |
| `src/lib/learning-content-generation.ts` | Creates structured chat-session artifact for episode learning content. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/lib/learning-dialogue.ts` | Continues learner dialogue inside current episode only. | `runtime-critical`, `state-mutation`, `learner-facing` |
| `src/app/api/chat/send/route.ts` | Явно deprecated legacy endpoint (`410 Gone`). | `legacy` |

## Test Generation / Submit / Statistics

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `src/app/(main)/practice/page.tsx` | Secondary custom-practice launcher; не основной episode loop, но активный learner path. | `learner-facing`, `ambiguous` |
| `src/app/(main)/tests/[id]/page.tsx` | Standalone test runner page for generated test artifact. | `learner-facing`, `ambiguous` |
| `src/app/(main)/tests/[id]/TestRunner.tsx` | Custom practice runner with submit-time prediction vs actual display. | `learner-facing`, `ambiguous` |
| `src/app/api/tests/generate/route.ts` | Генерация standalone test artifact. | `state-mutation`, `learner-facing`, `ambiguous` |
| `src/app/api/tests/[id]/submit/route.ts` | Submit-time scoring, telemetry, prediction-vs-actual logging. | `runtime-critical`, `state-mutation`, `data-pipeline` |
| `src/lib/test-generation.ts` | Core generator, tagging, delivery compliance, evaluation linkage. | `runtime-critical`, `state-mutation`, `learner-facing`, `data-pipeline` |
| `src/lib/test-schema.ts` | Canonical JSON contract for generated tests. | `config` |
| `src/lib/test-payload.ts` | Answer-key sanitization and leak prevention. | `runtime-critical`, `config` |
| `src/lib/statistics.ts` | User/effective-preference updates and baseline statistics accumulation. | `runtime-critical`, `state-mutation`, `data-pipeline` |
| `src/app/api/users/me/dashboard/route.ts` | Analytics feed over attempts, predictions and durations. | `learner-facing`, `data-pipeline` |
| `src/lib/profile.ts` | Profile aggregation including declared/effective preference separation. | `learner-facing`, `data-pipeline` |

## Dataset Export / Training / Synthetic

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `src/lib/dataset-export.ts` | Attempt-level export with pseudonymous identifiers and consent filtering. | `state-mutation`, `data-pipeline`, `ml-tooling` |
| `src/app/api/admin/dataset-export/route.ts` | Admin download path for attempt-level dataset export. | `state-mutation`, `data-pipeline`, `learner-facing` |
| `src/app/api/admin/evaluation-export/route.ts` | Admin download path for evaluation episode export. | `state-mutation`, `data-pipeline` |
| `src/lib/training-dataset.ts` | Canonical operational episode -> training snapshot exporter. | `state-mutation`, `data-pipeline`, `ml-tooling` |
| `src/lib/training-dataset-contract.ts` | Shared training snapshot schema/version/phase contract. | `config`, `data-pipeline` |
| `src/lib/training-eligibility.ts` | Consent/exclusion logic for future training eligibility. | `runtime-critical`, `state-mutation`, `data-pipeline` |
| `src/lib/research-consent.ts` | Consent version marker. | `config` |
| `src/lib/eduai-native-synthetic.ts` | In-repo synthetic bridge generator that seeds runtime-like episodes and exports snapshots. | `state-mutation`, `data-pipeline`, `ml-tooling` |
| `src/lib/eduai-native-synthetic-world.ts` | Synthetic learner/world assumptions and controlled decision effects. | `ml-tooling`, `config` |
| `scripts/training-dataset-export.sh` | CLI wrapper for training snapshot export. | `data-pipeline`, `ml-tooling` |
| `scripts/eduai-native-synthetic-generate.sh` | CLI wrapper for synthetic bridge generation. | `data-pipeline`, `ml-tooling` |
| `bootstrap_training/assistments_2009_2010/` | External bootstrap offline training workspace on ASSISTments. | `data-pipeline`, `ml-tooling` |
| `bootstrap_training/eduai_native_synthetic/` | Synthetic-native offline training/eval + runtime slot handoff workspace. | `data-pipeline`, `ml-tooling` |
| `training_datasets/` | Snapshot outputs by phase; real-phase currently only placeholder README. | `data-pipeline`, `ml-tooling` |

## Schema / Migrations / Models

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `prisma/schema.prisma` | Каноническая operational schema: `User`, `GeneratedTest`, `TestAttempt`, `ChatSession`, `EvaluationEpisode`, `EvaluationEpisodeItem`, `RateLimitBucket`, `OperatorAuditEvent`. | `runtime-critical`, `state-mutation`, `config` |
| `prisma/migrations/20260211142500_axis_schema_v2_telemetry/` | Важный переход к axis schema v2 и telemetry layer. | `state-mutation`, `config` |
| `prisma/migrations/20260211233200_user_password_hash/` | Runtime auth hardening via password hash. | `state-mutation`, `config` |
| `prisma/migrations/20260212000500_user_research_consent/` | Consent/training eligibility support. | `state-mutation`, `data-pipeline` |
| `prisma/migrations/20260326204916_user_tag_stat_correct_count_float/` | Weighted evidence in tag stats. | `state-mutation`, `data-pipeline` |
| `prisma/migrations/20260327050000_evaluation_episode_support/` | Ввод `EvaluationEpisode` support layer. | `state-mutation`, `data-pipeline` |
| `prisma/migrations/20260327103000_evaluation_protocol_engine/` | Protocol-level episode items, roles, provenance. | `state-mutation`, `data-pipeline` |
| `prisma/migrations/20260327113500_training_dataset_phase_support/` | `datasetPhase`/`datasetOrigin` for export separation. | `state-mutation`, `data-pipeline` |
| `prisma/migrations/20260402223000_episode_idempotency_guards/` | Защита от повторной materialization/duplicate episode steps. | `state-mutation`, `runtime-critical` |
| `prisma/migrations/20260402230000_pilot_operational_infra/` | Rate limits, operator audit, readiness infra. | `state-mutation`, `runtime-critical` |
| `src/lib/prisma.ts` | Единственная Prisma boundary. | `runtime-critical`, `state-mutation` |

## Evaluation / Backtest / Calibration

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `src/lib/evaluation.ts` | Evaluation protocol contract, arm assignment, sequence roles, summaries, exports. | `runtime-critical`, `state-mutation`, `data-pipeline`, `config` |
| `src/lib/learning-episode.ts` | Runtime execution of structured evaluation episodes. | `runtime-critical`, `state-mutation`, `data-pipeline` |
| `src/lib/prediction-backtest.ts` | Replay-safe historical backtest engine for policy comparison. | `data-pipeline`, `ml-tooling` |
| `src/lib/prediction-calibration.ts` | Parameter search/calibration over backtest splits. | `data-pipeline`, `ml-tooling` |
| `src/app/api/admin/prediction-backtest/route.ts` | Admin API for backtest comparison. | `learner-facing`, `ml-tooling` |
| `src/app/api/admin/prediction-calibration/route.ts` | Admin API for calibration runner. | `learner-facing`, `ml-tooling` |
| `src/app/(main)/admin/episodes/page.tsx` | Operator-facing episode inspection/export readiness UI. | `learner-facing`, `data-pipeline` |
| `scripts/prediction-backtest-self-check.sh` | Self-check for backtest stack. | `ml-tooling` |
| `scripts/prediction-calibration-self-check.sh` | Self-check for calibration stack. | `ml-tooling` |
| `scripts/learning-episode-self-check.sh` | Self-check for episode-first learner loop. | `ml-tooling`, `data-pipeline` |
| `scripts/operator-research-self-check.sh` | Self-check for operator/admin research flow. | `ml-tooling`, `data-pipeline` |

## Configs / Active Policy / Serving Integration

| Путь | Короткая пометка | Теги |
| --- | --- | --- |
| `configs/active_policy.json` | Активный backend selection; сейчас heuristic, не artifact ML. | `runtime-critical`, `config` |
| `src/lib/active-policy.ts` | Runtime parsing and fallback logic for active policy. | `runtime-critical`, `config` |
| `src/lib/operational-readiness.ts` | `health`/`ready`, DB/LLM/rate-limit/policy/artifact slot checks. | `runtime-critical`, `config` |
| `src/app/api/health/route.ts` | Liveness endpoint. | `runtime-critical`, `config` |
| `src/app/api/ready/route.ts` | Readiness endpoint with dependency checks. | `runtime-critical`, `config` |
| `src/lib/startup-env.ts` | Startup env assertions for main/demo layouts. | `runtime-critical`, `config` |
| `src/lib/admin-operational.ts` | Admin operational summary and audit feed assembly. | `data-pipeline`, `config` |
| `src/app/(main)/admin/page.tsx` | Admin overview for readiness/runtime/artifact/consent/export. | `learner-facing`, `config` |
| `artifacts/runtime/eduai_native_pedagogy/current/` | Handoff slot for future native artifact serving; currently inactive/deferred. | `config`, `data-pipeline`, `ml-tooling` |
| `src/lib/model-artifact-slot.ts` | Slot metadata contract and placeholder/loaded/invalid states. | `config`, `ml-tooling` |

## Likely Legacy / Dead / Ambiguous Zones

| Путь | Статус | Почему важно отметить | Теги |
| --- | --- | --- | --- |
| `src/app/api/chat/send/route.ts` | deprecated | Явный `410 Gone`, replacement `/api/chat`. | `legacy` |
| `src/app/api/admin/analytics/route.ts` | deprecated | Явный `410 Gone`, replacement split metrics endpoints. | `legacy` |
| `src/app/(main)/admin/analytics/page.tsx` | redirect-only | Перенаправляет на `/admin`; не самостоятельная active surface. | `legacy` |
| `src/app/(main)/chat/page.tsx` | redirect-only | Старый surface name, now redirects to `/learn`. | `legacy` |
| `src/app/(main)/tests/page.tsx` | redirect-only | Старый surface name, now redirects to `/practice`. | `legacy` |
| `src/app/(main)/insights/page.tsx` | redirect-only | Redirect to `/analytics`. | `legacy` |
| `src/app/(main)/dashboard/page.tsx` | redirect-only | Redirect to `/analytics`. | `legacy` |
| `src/app/(main)/progress/page.tsx` | redirect-only | Redirect to `/analytics`. | `legacy` |
| `src/app/(main)/subjects/page.tsx` | redirect-only | Redirect to `/topics`. | `legacy` |
| `src/app/(main)/collections/[id]/page.tsx` | redirect-only | Redirect to `/topics`. | `legacy` |
| `src/app/api/subjects/sections/` | empty directory | Пустой след route hierarchy; кандидат на cleanup либо ошибка scaffold. | `ambiguous` |
| `src/app/api/chat/route.ts` | active but secondary | Реальный endpoint есть, но текущий learner main loop использует episode dialogue path. | `ambiguous` |
| `src/app/(main)/tests/[id]/page.tsx` + `src/app/api/tests/*` | active secondary path | Standalone custom practice сосуществует с episode-first loop; важно не спутать с primary architecture. | `ambiguous` |
| `src/app/(demo)/` + `src/components/demo/` | demo-only | Скриптовый showcase, не production/runtime core и не research signal. | `ambiguous` |
| `artifacts/ui-audit-20260402/` | generated evidence | Полезно для UI history, но не для core ML-transition audit. | `legacy`, `ambiguous` |
| `ml/AGENTS.md` | placeholder-ish | Есть scope guard, но нет отдельного ML code lane внутри `/ml`. | `ambiguous` |

## Что, вероятно, обязательно включать в review-pack

- `AGENTS.md`, `VISION.md`, `docs/RESEARCH_SPEC.md`.
- `docs/ARCHITECTURE.md`, `docs/PREDICTION_LAYER.md`, `docs/DATA_MODEL.md`, `docs/TRAINING_DATASET_EXPORT.md`, `docs/AXIS_SCHEMA_V2.md`, `docs/LEARNING_POLICY_V2.md`, `docs/LEGACY_REMOVAL.md`, `docs/REPRODUCIBILITY.md`, `docs/ADMIN_OBSERVABILITY.md`.
- `src/app/`, `src/components/learner/`, `src/components/dashboard/`, `src/lib/` целиком либо как минимум все файлы из разделов Active Runtime / Prediction / Evaluation / Dataset Export.
- `prisma/schema.prisma` и миграции от `20260211142500_axis_schema_v2_telemetry` и новее; для полной audit trace лучше весь `prisma/migrations/`.
- `configs/active_policy.json`.
- `scripts/` целиком: self-checks и export/train wrappers являются частью operating model.
- `bootstrap_training/assistments_2009_2010/README.md`, `configs/`, `scripts/`, `src/`.
- `bootstrap_training/eduai_native_synthetic/README.md`, `scripts/`, `src/`.
- `training_datasets/README.md`, `training_datasets/real/README.md`, `training_datasets/synthetic/README.md`.
- `artifacts/runtime/eduai_native_pedagogy/current/README.md`, `slot_metadata.json`, при необходимости `artifact.json` как contract sample.

## Что можно не включать или включать частично

- Реальные `.env`, `.env.local`, любые секреты и token-bearing файлы: исключить полностью.
- `node_modules/`, `.next/`, `dist/`, `build/`, `coverage/`, `__pycache__/`, `.logs/`, `test-results/`, `codex-report/`, `eduai-clean/`: исключить полностью.
- `public/` можно включать частично; для архитектурного аудита они вторичны.
- `artifacts/ui-audit-20260402/` можно не включать, либо приложить только `summary.json` и runner/spec при необходимости UI history.
- `bootstrap_training/**/data/raw|interim|processed|artifacts` включать частично: лучше метаданные/summary/schema, без тяжёлых CSV/Parquet/Joblib по умолчанию.
- `training_datasets/synthetic/*/dataset.csv` включать частично: обычно достаточно `README.md`, `schema.json`, `metadata.json`, `manifest.json` и, максимум, одного representative snapshot.
- `package-lock.json` и `public/*` не обязательны для архитектурного аудита, но полезны для reproducibility/environment snapshot.
- Demo-зона `src/app/(demo)/`, `src/components/demo/`, `src/lib/demo-script.ts` скорее опциональна.

## Чего потенциально не хватает для полноценного перехода к ML-ready архитектуре

- Нет стабильного audit snapshot/manifest на уровне репозитория: worktree грязный, поэтому внешний аудитор увидит переходный момент, но не зафиксированный релизный baseline.
- Нет отдельного CI/test harness слоя (`.github`, `jest/vitest/playwright` configs отсутствуют); проверка строится в основном на shell self-check scripts.
- Активный runtime backend пока heuristic baseline; native artifact slot существует, но serving integration остаётся отложенной.
- Реальная фаза `training_datasets/real/` пока фактически пуста; реальный retraining path архитектурно подготовлен, но operational evidence ещё не накоплен.
- Нет явного script/manifest для сборки самого review-pack; этот индекс помогает, но reproducible pack assembler пока не оформлен как first-class workflow.

## Короткий вывод для сборки review-pack

Для внешнего аудита перехода от эвристической архитектуры к ML-ready исследовательской системе основной фокус нужно держать на пяти связках:

1. `docs/*` research/architecture contracts + `AGENTS.md`/`VISION.md`.
2. `prisma/` + `src/lib/evaluation.ts` + `src/lib/learning-episode.ts` как ядро episode/provenance data model.
3. `src/lib/personalization-runtime.ts` + `src/lib/prediction*.ts` + `configs/active_policy.json` как prediction/runtime layer.
4. `src/lib/training-dataset*.ts`, `src/lib/dataset-export.ts`, `training_datasets/`, `bootstrap_training/` как bridge to offline ML.
5. Явная пометка transition-зон: standalone practice/chat paths, redirects, deprecated endpoints, demo-only surfaces.

Без этой пометки аудитор легко переоценит зрелость runtime ML serving или ошибочно примет secondary paths за основную целевую архитектуру.
