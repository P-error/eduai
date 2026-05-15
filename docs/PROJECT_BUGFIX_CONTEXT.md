# Контекст проекта для точечных багфиксов

Документ создан как снимок текущего репозитория для будущих локальных багфиксов. Он описывает код и видимые контракты, а не целевое состояние продукта.

## Проверка корректности задачи

### Что можно уверенно описать по коду

- Авторизацию через email/password, JWT cookie и API `app/api/auth/**`.
- Пользовательские предметы, коллекции и разделы через Prisma-модели `Collection`, `Subject`, `SubjectSection` и API `app/api/collections/**`, `app/api/subjects/**`.
- Генерацию тестов, прохождение теста, подсчет результата, телеметрию попытки и запись статистики через `src/lib/test-generation.ts` и `app/api/tests/**`.
- Episode-first обучающий поток через `EvaluationEpisode`, `EvaluationEpisodeItem`, `src/lib/learning-episode.ts`, `src/lib/learning-content-generation.ts`, `src/lib/learning-dialogue.ts`.
- LLM-вызовы через единый провайдер `src/lib/llm/provider.ts`; прямых внешних LLM-вызовов вне этого слоя в runtime не найдено.
- Текущий prediction/personalization runtime: активная политика в `configs/active_policy.json` использует `heuristic_baseline`, а не model-owned ML по умолчанию.
- Prisma-схему, индексы, связи и JSON-поля по `prisma/schema.prisma`.
- Набор self-check-скриптов по `package.json` и `scripts/`.
- Отдельный исследовательский Python/ML слой в `ml/` с контрактами, схемами, синтетикой и candidate scorer pipeline.

### Где есть неоднозначность, устаревшие документы или конфликт

- В persistent-инструкциях указан стек `Next.js 15`, но `package.json` сейчас содержит `next: 16.1.3`, `react: 19.2.3`, `react-dom: 19.2.3`.
- В инструкциях и исследовательской рамке перечислены 10 authoring/tagging axes (`education_level`, `tone`, `style`, `format`, `depth`, `cognitive_level`, `task_type`, `micro_complexity`, `domain`, `context`), но runtime-код `src/lib/tags.ts` реально использует legacy-набор из 7 осей (`tone`, `explanation_style`, `response_format`, `difficulty_target`, `cognitive_process`, `task_family`, `context`) плюс отдельное declared-поле `depth`.
- `README.md`, `VISION.md` и `docs/RESEARCH_SPEC.md` корректно предупреждают, что runtime не полностью ML-owned. Это совпадает с кодом: активный backend сейчас `heuristic_baseline`.
- `ml/README.md` говорит, что production runtime integration и real-user six-factor delivered-config logging не реализованы. Текущий TypeScript runtime уже содержит optional six-factor shadow/apply/logging integration под env-флагами. Значит `ml/README.md` частично устарел относительно текущего кода.
- Документация местами говорит о целевой архитектуре, а не о текущем поведении. Для багфиксов source of truth: код, `prisma/schema.prisma`, `package.json`, затем `docs/RESEARCH_SPEC.md`/`VISION.md`.
- Репозиторий на момент подготовки документа уже имел незакоммиченные изменения в `.env.example`, `.env.production.example`, `prisma/schema.prisma`, `src/app/api/chat/route.ts`, `src/app/api/evaluation/episodes/[id]/dialogue/route.ts`, `src/app/api/evaluation/episodes/[id]/next/route.ts`, `src/app/api/tests/generate/route.ts` и untracked `docs/VERCEL_DEPLOYMENT.md`. Этот документ описывает именно текущую рабочую копию.
- Деплой описан в docs/env examples как Vercel + Postgres, но `vercel.json` или CI/deploy workflow в корне не найден. Есть только `docker-compose.yml` для локальной БД и `public/vercel.svg`.

### Что не найдено и не следует додумывать

- Не найден npm-скрипт `typecheck`.
- Не найден npm-скрипт `test`.
- Не найдено подтверждение, что активный learner-facing runtime по умолчанию использует обученную ML-модель вместо эвристического baseline.
- Не найден единый general chat session API, который продолжает одну и ту же обычную чат-сессию между запросами; `/api/chat` сохраняет новый `ChatSession` на turn, а episode dialogue дописывает сообщения в session learning-content шага.
- Не найдено доказательство production-деплоя в текущей рабочей копии; есть только документация/примерные env-файлы.

# 1. Краткое назначение проекта

EduAI - thesis-defensible прототип для прогнозирования и выбора следующего педагогически значимого образовательного действия/контента для отдельного обучающегося.

Основной пользовательский цикл в текущем коде:

1. Пользователь регистрируется или входит.
2. Создает предмет и при необходимости разделы/темы.
3. Запускает обучение через episode-first поток или генерирует практический тест.
4. Система выбирает/материализует педагогическое решение (`difficulty`, `depth` и rendering-параметры), генерирует тест или learning content через LLM либо fallback.
5. Пользователь проходит тест или взаимодействует с episode learning dialogue.
6. Результаты, телеметрия и episode items сохраняются.
7. Статистика, learner truth, dashboard и prediction runtime используют накопленные попытки для следующего решения.

Важно: learner-facing chat в коде ограничивается образовательным контекстом, но обычный `/api/chat` не является главным owner обучающего цикла. Основной контур сейчас - `Learn`/episodes и structured checks.

# 2. Технологический стек

Фронтенд:

- Next.js App Router, TypeScript, React.
- По `package.json`: `next 16.1.3`, `react 19.2.3`, `react-dom 19.2.3`.
- Tailwind CSS 4 через `@tailwindcss/postcss`.
- UI расположен в `src/app/(main)/**`, `src/components/**`.
- Client auth helper: `src/lib/client-auth.ts`.

Бэкенд:

- Next.js route handlers в `src/app/api/**/route.ts`.
- Runtime в большинстве API явно `nodejs`.
- Серверная логика вынесена в `src/lib/**`.

База данных:

- PostgreSQL.
- Локальный compose: `docker-compose.yml`.
- Основная схема: `prisma/schema.prisma`.

ORM:

- Prisma 5.
- Prisma singleton: `src/lib/prisma.ts`.

Авторизация:

- Email/password auth.
- Пароли хешируются через `src/lib/auth-password.ts` (`scrypt_v1`).
- JWT cookie через `src/lib/auth.ts`, имя cookie в `src/lib/auth-constants.ts`.
- В production `JWT_SECRET` обязателен; в dev есть fallback `dev-secret`.

LLM/API:

- Все runtime LLM-вызовы идут через `src/lib/llm/provider.ts`.
- OpenAI-compatible endpoint: `OPENAI_BASE_URL` optional, default `https://api.openai.com/v1`.
- Обязательный ключ для live LLM: `OPENAI_API_KEY`.
- Вызовы в текущем коде используют модель `gpt-4o-mini` на уровне callers.

ML-часть:

- Runtime prediction слой: `src/lib/prediction-runtime.ts`, `src/lib/prediction-feature-layer.ts`, `src/lib/personalization-runtime.ts`.
- Активная policy config: `configs/active_policy.json`, сейчас `heuristic_baseline`.
- Artifact-backed accuracy ML поддержан кодом через `src/lib/prediction-ml.ts`, но не активен по текущему config.
- Six-factor research/runtime bridge: `src/lib/ml-six-factor-*.ts`, artifact path задается через `EDUAI_SIX_FACTOR_ARTIFACT_PATH`.
- Отдельный Python ML слой: `ml/` (`pyproject.toml`, контракты, JSON Schema, тесты, training/evaluation scripts).

Деплой:

- В документах и env examples описан Vercel + PostgreSQL/Neon-подобные connection strings.
- В корне не найден `vercel.json`.
- Production health endpoints: `/api/health`, `/api/ready`.

# 3. Как запускать и проверять

Команды из `package.json`:

```bash
npm ci
cp .env.example .env.local
npm run db:up
npm run prisma:migrate:deploy
npm run dev:local
```

`npm run dev:local` делает три вещи: запускает compose Postgres, применяет `prisma migrate deploy` к локальному compose URL и стартует Next.js dev server.

Альтернативный локальный запуск, если БД и `DATABASE_URL` уже подготовлены:

```bash
npm run dev
```

Production-like local path:

```bash
npm run db:up
npm run prisma:migrate:deploy
npm run build
npm run start
```

Проверки:

```bash
npm run lint
npm run build
npx prisma validate
npm run prisma:generate
```

Миграции:

```bash
npm run prisma:migrate
npm run prisma:migrate:deploy
```

`npm run prisma:migrate` запускает `prisma migrate dev`; его не следует запускать автоматически для багфиксов без явной причины. Для существующей схемы и деплоя используется `npm run prisma:migrate:deploy`.

Self-check scripts из `package.json`:

```bash
npm run auth:self-check
npm run rate-limit:self-check
npm run learner-flow-contract:self-check
npm run learner-facing:self-check
npm run learning-episode:self-check
npm run learning-evidence:self-check
npm run learner-truth:self-check
npm run learner-orchestration:self-check
npm run training-dataset:self-check
npm run dataset-export:self-check
npm run backtest:self-check
npm run calibration:self-check
npm run ml-accuracy:self-check
npm run pilot-readiness:smoke
```

ML layer:

```bash
python -m pip install -e "ml[test]"
python ml/scripts/validate_ml_contracts.py
python -m pytest ml/tests
```

Честные ограничения команд:

- `typecheck` npm-скрипт отсутствует. При необходимости можно запускать `npx tsc --noEmit`, но это не оформлено в `package.json`.
- `test` npm-скрипт отсутствует. Проверки разбиты на self-check scripts и Python tests в `ml/`.
- Команды, требующие БД, зависят от `DATABASE_URL`, `DIRECT_URL` и доступности PostgreSQL.
- `npx prisma validate` тоже требует, чтобы были заданы `DATABASE_URL` и `DIRECT_URL`, потому что datasource в `prisma/schema.prisma` использует `url` и `directUrl`.
- Live LLM-проверки зависят от `OPENAI_API_KEY` и optional `OPENAI_BASE_URL`.

# 4. Структура проекта

Основная карта:

- `src/app/` - Next.js App Router: страницы, layouts, API route handlers.
- `src/app/(main)/` - основная learner/admin UI зона: login/register, topics, learn, practice, tests, profile, analytics, admin.
- `src/app/(demo)/` - demo surface.
- `src/app/api/` - backend API routes. Все новые API должны быть здесь.
- `src/components/` - React-компоненты: dashboard, learner episode workspace, system UI primitives, demo, i18n/settings providers.
- `src/lib/` - серверные и shared контракты: auth, Prisma, LLM, generation, prediction, evaluation, personalization, training/export, self-checks.
- `src/lib/llm/provider.ts` - единый gateway для внешней LLM.
- `src/lib/prisma.ts` - Prisma singleton.
- `prisma/schema.prisma` - схема PostgreSQL/Prisma.
- `prisma/migrations/` - миграции БД.
- `configs/active_policy.json` - активный prediction runtime config.
- `docs/` - документация. Приоритет для текущего behavior ниже кода; `docs/RESEARCH_SPEC.md` и `VISION.md` важны для исследовательской рамки.
- `ml/` - отдельный Python research/training layer: контракты, JSON Schema, synthetic data, scorer scripts, tests.
- `scripts/` - локальные self-check, export, audit, smoke и pilot scripts.
- `artifacts/runtime/eduai_native_pedagogy/` - runtime artifacts для six-factor/native pedagogy experiments.
- `training_datasets/` - локальные training/export данные, если есть.
- `public/` - статические файлы.
- `sync_docs.py` - локальный workflow отправки docs/report файлов на телефон через Taildrop/SSH.
- `docker-compose.yml` - локальный PostgreSQL.

Не включать в проектную карту для багфиксов:

- `node_modules/`
- `.next/`
- `dist/`, `build/`, кэши
- `.logs/`
- `codex-report/`, `reports/`
- `exports/`
- `tmp/`
- `eduai-clean/`
- `ml/.venv/`, `ml/.pytest_cache/`
- временные UI-audit artifacts в `artifacts/ui-audit-*`

# 5. Основные пользовательские сценарии

## Регистрация и вход

UI:

- `src/app/(main)/register/page.tsx`
- `src/app/(main)/login/page.tsx`
- `src/app/AuthGate.tsx`
- `src/app/AuthActions.tsx`

API/сервер:

- `POST /api/auth/register` - `src/app/api/auth/register/route.ts`
- `POST /api/auth/login` - `src/app/api/auth/login/route.ts`
- `POST /api/auth/logout` - `src/app/api/auth/logout/route.ts`
- `src/lib/auth.ts`
- `src/lib/auth-password.ts`
- `src/lib/rate-limit.ts`

Таблицы:

- `User`
- `RateLimitBucket`

Данные:

- `User.externalId = email:<email>`
- `User.email`
- `User.passwordHash`
- `User.name`
- `User.researchConsentAt`, `researchConsentVersion` при согласии
- JWT cookie с 30-дневным TTL

Фолбэки/заглушки:

- `JWT_SECRET` в dev может иметь fallback `dev-secret`; в production это запрещено проверками startup env.
- При недоступной БД register/login возвращают `DB_UNAVAILABLE`.
- Rate limit хранится в `RateLimitBucket`, очистка opportunistic.

## Создание/выбор предмета

UI:

- `src/app/(main)/topics/page.tsx`
- `src/app/(main)/topics/[topicId]/page.tsx`
- Legacy redirects/pages: `src/app/(main)/subjects/page.tsx`, `src/app/(main)/subjects/[subjectId]/page.tsx`
- `src/app/(main)/collections/[id]/page.tsx`

API/сервер:

- `GET/POST /api/collections`
- `PATCH/DELETE /api/collections/[id]`
- `GET/POST /api/subjects`
- `PATCH/DELETE /api/subjects/[subjectId]`
- `GET/POST /api/subjects/[subjectId]/sections`
- `PATCH/DELETE /api/subjects/[subjectId]/sections/[sectionId]`
- `GET /api/subjects/[subjectId]/stats`
- `GET /api/subjects/[subjectId]/recommendation`
- `src/lib/collections.ts`
- `src/lib/recommendation.ts`

Таблицы:

- `Collection`
- `Subject`
- `SubjectSection`
- `GeneratedTest`
- `TestAttempt`
- `UserTagStat`

Данные:

- Создается default collection через `ensureDefaultCollection`.
- `Subject.title` хранится в Prisma как `title`, но замаплен на DB column `name`.
- Удаление предмета - soft archive через `archivedAt`.
- Удаление раздела - hard delete `SubjectSection`, связанные tests/episodes получают `sectionId = null` по schema relations.

Фолбэки/заглушки:

- `GET /api/subjects` мутирует данные: переносит предметы без `collectionId` в default collection.
- PATCH коллекции и раздела использует `parentId: payload.parentId ?? undefined`; явная отвязка parent через `null` может не сработать.

## Образовательный чат

UI:

- `src/app/(main)/chat/page.tsx`
- Episode dialogue surface внутри `src/components/learner/LearnerEpisodeWorkspace.tsx`

API/сервер:

- `POST /api/chat`
- `POST /api/chat/send` - deprecated, возвращает 410
- `POST /api/evaluation/episodes/[id]/dialogue`
- `src/lib/chat.ts`
- `src/lib/learning-dialogue.ts`
- `src/lib/llm-prompt-builders.ts`

Таблицы:

- `ChatSession`
- `ChatMessage`
- `PromptTemplate`
- `User`
- `UserTagStat`
- `EvaluationEpisode`
- `EvaluationEpisodeItem`

Данные:

- Обычный `/api/chat` строит prompt context, выбирает personalization/baseline/self-report path, вызывает LLM, сохраняет turn в новый `ChatSession`.
- Episode dialogue дописывает сообщения в `ChatSession`, созданную learning-content шагом.
- По умолчанию raw chat content редактируется: сохраняются `[redacted_user_message]`/`[redacted_assistant_message]`, а UI-текст может быть в `signalsJson.uiThreadText`. Raw storage включается только `CHAT_STORE_RAW_CONTENT=1`.
- Chat UX reward обновляет `UserTagStat` по `tone` и `explanation_style` только как слабый secondary signal.

Фолбэки/заглушки:

- Обычный `/api/chat` при LLM ошибке возвращает `502 LLM_BAD_RESPONSE`; fallback-ответа нет.
- Episode dialogue при disabled/missing/failed LLM строит fallback reply и не обновляет UX stats (`FALLBACK_DIALOGUE`).
- Chat signal не должен трактоваться как primary learning gain.

## Генерация теста

UI:

- `src/app/(main)/practice/page.tsx`
- Redirect page: `src/app/(main)/tests/create/page.tsx`

API/сервер:

- `POST /api/tests/generate`
- `src/lib/test-generation.ts`
- `src/lib/llm/provider.ts`
- `src/lib/llm-tagger.ts`
- `src/lib/tagger.ts`
- `src/lib/recommendation.ts`
- `src/lib/personalization-runtime.ts`

Таблицы:

- `GeneratedTest`
- `PromptTemplate`
- `TagLegendVersion`
- `TagAxis`
- `Tag`
- `TagAssignment`
- `EvaluationEpisode`
- `EvaluationEpisodeItem`

Данные:

- `GenerateSchema`: `subjectId`, optional `sectionId`, `topic`, `questionCount` 1-20, `mode`, `personalizationMode`, optional `delivery`, optional `evaluation`.
- Генерация проверяет ownership subject/section.
- Создает/проверяет tag legend.
- Выбирает policy path: baseline, self-report declared или predicted runtime.
- Строит prompt через `test_generation_v1`, `buildTestSystemPrompt`, optional episode package и optional six-factor apply block.
- Сохраняет `GeneratedTest` с prompt/template metadata, raw/normalized LLM JSON, `validationMetaJson`, `questionsJson`, `profileSnapshotJson`, recommendation/evaluation metadata.
- Создает `TagAssignment` по вопросам.

Фолбэки/заглушки:

- Если LLM disabled (`EDUAI_SYNTHETIC_DISABLE_LLM`) или нет `OPENAI_API_KEY`, используется `fallbackTest`.
- Если LLM JSON/Schema invalid или provider error, используется `fallbackTest`.
- Если LLM tagger disabled/fails/invalid tags, используется rule fallback `tagQuestion`.
- Fallback tests выглядят как валидный тест, но submit path исключает их из learning update.
- В `POST /api/tests/generate` `GenerateSchema.parse(rawBody)` находится вне `try`; invalid payload может привести к необработанной ошибке route handler.

## Прохождение теста

UI:

- `src/app/(main)/tests/[id]/page.tsx`
- `src/app/(main)/tests/[id]/TestRunner.tsx`
- Episode test UI внутри `LearnerEpisodeWorkspace`

API/сервер:

- `POST /api/tests/[id]/submit`
- `src/lib/test-payload.ts`
- `src/lib/statistics.ts`
- `src/lib/learning-evidence-contract.ts`

Таблицы:

- `GeneratedTest`
- `TestAttempt`
- `TagAssignment`
- `UserTagStat`
- `User`
- `EvaluationEpisodeItem`

Данные:

- Server page отдает вопросы без `answerIndex`, затем проверяет отсутствие утечки.
- UI отправляет `answers`, `totalDurationMs`, `perQuestionFirstAnswerMs`, `answerChangeCount`.
- Submit route перепроверяет correctness по `GeneratedTest.questionsJson`.
- Одна попытка на test/user (`@@unique([userId, testId])`); повторная отправка возвращает существующий результат.
- Считаются `score`, `byTag`, UX reward, prediction-vs-actual metadata, learning evidence.

Фолбэки/заглушки:

- Попытка может быть исключена из learning update: fallback generation/tagging, low compliance, default collection, explicit learningEligible false, invalid tag warnings.
- Standalone `TestRunner` вызывает `response.json()` и сразу `setResult(json)` без проверки `response.ok`; UI может плохо обработать error payload.

## Сохранение результатов

UI:

- `TestRunner`
- `LearnerEpisodeWorkspace`
- `src/components/learner/AttemptEvidenceSummary.tsx`
- Analytics/profile/dashboard components

API/сервер:

- `POST /api/tests/[id]/submit`
- `src/lib/statistics.ts`
- `src/lib/prediction-feature-layer.ts`
- `src/lib/prediction-runtime.ts`
- `src/lib/evaluation.ts`

Таблицы:

- `TestAttempt`
- `UserTagStat`
- `User`
- `EvaluationEpisodeItem`

Данные:

- Всегда сохраняется `TestAttempt`, если это первая валидная submit попытка.
- `byTagJson._meta` хранит policy/evidence/prediction/evaluation metadata.
- Если learning не skipped: обновляются `UserTagStat`, `User.testsTaken`, `User.effectivePreferencesJson`, `User.personalizationReady`.
- Если test связан с episode item, `recordEvaluationTestOutcome` обновляет `EvaluationEpisodeItem.outcomeJson`.

Фолбэки/заглушки:

- `User.testsTaken` увеличивается только для learning-eligible попыток, хотя название поля выглядит как счетчик всех пройденных тестов.
- Значимые runtime-контракты хранятся в JSON-полях без DB-level schema enforcement.

## Эпизоды

UI:

- `src/app/(main)/learn/page.tsx`
- `src/app/(main)/learn/start/page.tsx`
- `src/components/learner/LearnerEpisodeWorkspace.tsx`
- Admin episode surface: `src/app/(main)/admin/episodes/page.tsx`

API/сервер:

- `GET /api/learner-flow/entry`
- `GET/POST /api/evaluation/episodes`
- `GET /api/evaluation/episodes/[id]`
- `POST /api/evaluation/episodes/[id]/next`
- `POST /api/evaluation/episodes/[id]/dialogue`
- `src/lib/learning-episode.ts`
- `src/lib/learning-content-generation.ts`
- `src/lib/learning-dialogue.ts`
- `src/lib/evaluation.ts`

Таблицы:

- `EvaluationEpisode`
- `EvaluationEpisodeItem`
- `GeneratedTest`
- `TestAttempt`
- `ChatSession`
- `ChatMessage`
- `Subject`
- `SubjectSection`

Данные:

- `createLearningEpisode` создает orchestration package в `EvaluationEpisode.designJson.orchestration`.
- Default sequence: `precheck`, `learning_content`, `postcheck`; optional holdout/delayed recheck.
- `advanceLearningEpisode` материализует следующий item: generated test или learning content chat session.
- Learning content хранится как `ChatSession` + assistant `ChatMessage`, связанный с `EvaluationEpisodeItem`.
- Dialogue turns дописываются в тот же session.

Фолбэки/заглушки:

- Learning content fallback card при disabled/missing/failed LLM.
- Dialogue fallback reply при disabled/missing/failed LLM.
- Read-only state не материализует pending steps.
- Delayed recheck ждет due time.

## Аналитика

UI:

- `src/app/(main)/analytics/page.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/(main)/insights/page.tsx`
- Admin pages under `src/app/(main)/admin/**`
- Dashboard components under `src/components/dashboard/**`

API/сервер:

- `GET /api/users/me/dashboard`
- `GET /api/users/me/stats`
- `GET /api/users/me/predictions`
- `GET /api/users/me/prediction-metrics`
- `GET /api/subjects/[subjectId]/stats`
- `GET /api/admin/*-metrics`
- `GET /api/admin/prediction-backtest`
- `GET /api/admin/prediction-calibration`
- `GET /api/admin/dataset-export`
- `GET /api/admin/evaluation-export`
- `src/lib/admin-observability.ts`
- `src/lib/learner-truth.ts`
- `src/lib/prediction-backtest.ts`
- `src/lib/prediction-calibration.ts`
- `src/lib/dataset-export.ts`

Таблицы:

- `User`
- `GeneratedTest`
- `TestAttempt`
- `UserTagStat`
- `ChatSession`
- `ChatMessage`
- `EvaluationEpisode`
- `EvaluationEpisodeItem`
- `OperatorAuditEvent`

Данные:

- Learner dashboard собирает recent attempts, learner truth overview, prediction metadata.
- Admin dashboards агрегируют data quality, personalization, prediction, chat, tests.
- Dataset/evaluation export строится из replay-safe episode/test/chat связей и pseudonymized IDs.

Фолбэки/заглушки:

- `/api/users/me/stats` выглядит как более старый endpoint и может расходиться с learner truth/dashboard.
- Некоторые analytics-поля берутся из JSON metadata и могут отсутствовать в старых records.

## Персонализация/обновление профиля

UI:

- `src/app/(main)/profile/page.tsx`

API/сервер:

- `GET/PATCH /api/users/me`
- `GET /api/users/me/profile`
- `GET /api/users/me/predictions`
- `GET/PATCH /api/users/me/preferences`
- `POST /api/users/me/preferences/apply`
- `GET/PATCH /api/users/me/research-consent`
- `src/lib/profile.ts`
- `src/lib/prediction.ts`
- `src/lib/personalization-runtime.ts`
- `src/lib/statistics.ts`
- `src/lib/research-consent.ts`

Таблицы:

- `User`
- `UserTagStat`
- `TestAttempt`
- `GeneratedTest`

Данные:

- Declared preferences сохраняются в `User.declaredPreferencesJson`.
- Effective preferences сохраняются в `User.effectivePreferencesJson`.
- `personalizationReady` зависит от количества готовых осей и learning-eligible tests.
- `/preferences/apply` копирует effective preferences в declared preferences.
- Research consent/exclusion хранится в полях `User.researchConsent*`, `trainingDataExclusion*`.

Фолбэки/заглушки:

- Declared preferences валидируются только по runtime legacy axes + `depth`.
- Effective preference обновляется и через тесты, и через weak chat UX stats, хотя primary signal - structured tests.
- Rendering decisions (`tone`, `explanation_style`, `response_format`) являются rules/materialization layer, не core ML target.

# 6. Схема базы данных

## Пользователь: `User`

Назначение:

- Аккаунт, auth identity, research consent, declared/effective preferences, personalization readiness.

Ключевые поля:

- `id`
- `externalId`
- `email`
- `passwordHash`
- `researchConsentAt`, `researchConsentVersion`, `researchConsentWithdrawnAt`
- `trainingDataExclusionAt`, `trainingDataExclusionReason`
- `name`
- `isAdmin`
- `declaredPreferencesJson`
- `effectivePreferencesJson`
- `personalizationReady`
- `testsTaken`
- `createdAt`

Связи:

- `GeneratedTest[]`, `TestAttempt[]`, `UserTagStat[]`, `ChatSession[]`, `EvaluationEpisode[]`, `Collection[]`, `Subject[]`, `OperatorAuditEvent[]`.

Сценарии:

- Auth, profile, personalization, tests, chat, episodes, analytics, admin audit.

## Предметы/темы: `Collection`, `Subject`, `SubjectSection`

`Collection`:

- Назначение: пользовательские папки/коллекции для subject overlays.
- Поля: `id`, `userId`, `name`, `parentId`, `sortOrder`, timestamps.
- Связи: `User`, parent/children, `Subject[]`.
- Индексы/unique: `@@index([userId])`, `@@unique([userId, parentId, name])`.

`Subject`:

- Назначение: предмет/тема верхнего уровня.
- Поля: `id`, `userId`, `title @map("name")`, `description`, `collectionId`, `archivedAt`, timestamps.
- Связи: `User`, `Collection`, `SubjectSection[]`, `GeneratedTest[]`, `ChatSession[]`, `EvaluationEpisode[]`.
- Unique: `@@unique([userId, collectionId, title])`.

`SubjectSection`:

- Назначение: иерархические разделы внутри subject.
- Поля: `id`, `subjectId`, `title`, `description`, `parentId`, `sortOrder`, timestamps.
- Связи: `Subject`, parent/children, `GeneratedTest[]`, `EvaluationEpisode[]`.
- Индексы: `[subjectId]`, `[parentId]`, `[subjectId, sortOrder]`.

Сценарии:

- Topics/subjects UI, practice generation, episode scope, analytics scope.

## Тесты/вопросы/ответы: `GeneratedTest`, `TagLegendVersion`, `TagAxis`, `Tag`, `TagAssignment`

`GeneratedTest`:

- Назначение: сохраненный тестовый artifact.
- Поля: `userId`, `subjectId`, `sectionId`, `evaluationEpisodeId`, prompt/template metadata, `rawLlmOutput`, `normalizedJson`, `validationMetaJson`, `sectionSnapshot`, `recommended`, `recommendationSnapshot`, `topic`, `questionCount`, `mode`, `questionsJson`, `profileSnapshotJson`, `createdAt`.
- Связи: `User`, `Subject`, `SubjectSection`, `EvaluationEpisode`, `PromptTemplate`, `TagAssignment[]`, `TestAttempt[]`.
- Индекс: `[evaluationEpisodeId]`.

`TagLegendVersion`, `TagAxis`, `Tag`, `TagAssignment`:

- Назначение: runtime tag legend, per-question tags and stats support.
- `TagAxis.key` unique.
- `Tag` unique by `[axisId, key]`.
- `TagAssignment` unique by `[testId, questionIndex, axisId]`.

Сценарии:

- LLM/rule tagging, submit scoring by tag, personalization stats, analytics.

## Результаты: `TestAttempt`, `UserTagStat`

`TestAttempt`:

- Назначение: одна попытка пользователя по тесту.
- Поля: `answersJson`, `score`, `byTagJson`, `totalDurationMs`, `perQuestionFirstAnswerMsJson`, `answerChangeCount`, `createdAt`.
- Связи: `GeneratedTest`, `User`.
- Unique: `@@unique([userId, testId])`.

`UserTagStat`:

- Назначение: агрегаты по user/tag для effective preferences.
- Поля: `correctCount Float`, `totalCount Int`, `updatedAt`.
- Связи: `User`, `TagAxis`, `Tag`.
- Unique: `@@unique([userId, axisId, tagId])`.

Сценарии:

- Submit, chat UX stats, profile predictions, recommendation runtime.

## Эпизоды: `EvaluationEpisode`, `EvaluationEpisodeItem`

`EvaluationEpisode`:

- Назначение: episode-level контейнер для replay/evaluation: precheck, content delivery, postcheck, holdout/delay.
- Поля: `userId`, `clientKey`, `subjectId`, `sectionId`, `datasetPhase`, `datasetOrigin`, `objectiveKey`, `protocolKey`, `status`, `policyArm`, `primarySignalKind`, `topic`, `conceptKey`, `skillKey`, `assignmentJson`, `designJson`, timestamps.
- Связи: `User`, optional `Subject`, optional `SubjectSection`, `GeneratedTest[]`, `ChatSession[]`, `EvaluationEpisodeItem[]`.
- Индексы: `[userId, createdAt]`, `[subjectId, createdAt]`, `[userId, policyArm, createdAt]`, `[datasetPhase, createdAt]`.

`EvaluationEpisodeItem`:

- Назначение: конкретный delivered artifact внутри episode.
- Поля: `contentKind`, `contentId`, `sequenceIndex`, `sequenceRole`, `touchpointType`, `signalQuality`, `itemRole`, `itemVariant`, `linkageKind`, `linkedContentId`, `familyKey`, `conceptKey`, `skillKey`, `holdoutStrategy`, `delayedMinutes`, `policyArm`, `subjectId`, `sectionId`, `topic`, `pedagogicalDecisionJson`, `decisionRuntimeJson`, `outcomeJson`, `deliveredAt`, `outcomeRecordedAt`.
- Unique: `[contentKind, contentId]`, `[episodeId, sequenceRole]`, `[episodeId, sequenceIndex]`.
- Индексы: `[episodeId, sequenceRole]`, `[episodeId, familyKey]`, `[episodeId, linkedContentId]`.

Сценарии:

- Learn episodes, evaluation export, dataset export, policy comparison.

## Аналитика: JSON metadata + `OperatorAuditEvent`

Назначение:

- Analytics в текущем runtime в основном вычисляется из `GeneratedTest`, `TestAttempt`, `UserTagStat`, `ChatSession`, `ChatMessage`, `EvaluationEpisode`, `EvaluationEpisodeItem`.
- Admin/operator actions пишутся в `OperatorAuditEvent`.

`OperatorAuditEvent` поля:

- `actorUserId`, `action`, `targetType`, `targetId`, `result`, `ipAddress`, `summaryJson`, `createdAt`.
- Индексы: `[actorUserId, createdAt]`, `[action, createdAt]`, `[createdAt]`.

Сценарии:

- Admin dataset/evaluation export, audit view.

## Предпочтения/профиль: поля `User` + `UserTagStat`

Назначение:

- Declared preferences: то, что пользователь указал.
- Effective preferences: текущая системная оценка по данным.
- `UserTagStat`: evidence backing для effective preferences.

Ключевые поля:

- `User.declaredPreferencesJson`
- `User.effectivePreferencesJson`
- `User.personalizationReady`
- `User.testsTaken`
- `UserTagStat.correctCount`, `totalCount`

Сценарии:

- Profile, prediction cards, test/chat/episode personalization.

## ML/LLM-логи

Явной отдельной таблицы `LlmLog` или `MlLog` нет.

LLM/ML provenance хранится в:

- `GeneratedTest.rawLlmOutput`
- `GeneratedTest.normalizedJson`
- `GeneratedTest.validationMetaJson`
- `GeneratedTest.profileSnapshotJson`
- `GeneratedTest.recommendationSnapshot`
- `ChatSession.promptTemplate*`, `llmModel`, preference snapshots
- `ChatMessage.signalsJson`
- `EvaluationEpisode.assignmentJson`
- `EvaluationEpisode.designJson`
- `EvaluationEpisodeItem.pedagogicalDecisionJson`
- `EvaluationEpisodeItem.decisionRuntimeJson`
- `EvaluationEpisodeItem.outcomeJson`
- `TestAttempt.byTagJson._meta`

# 7. LLM-слой

## Где вызывается внешняя LLM

Единый provider:

- `src/lib/llm/provider.ts`

Runtime callers:

- `src/lib/test-generation.ts` - test JSON generation.
- `src/lib/llm-tagger.ts` - LLM tagging вопросов.
- `src/app/api/chat/route.ts` - обычный образовательный чат.
- `src/lib/learning-content-generation.ts` - structured learning content card.
- `src/lib/learning-dialogue.ts` - dialogue внутри episode learning content.

Audit/check scripts:

- `scripts/check-llm-prompt-compliance.ts`
- `scripts/audit-llm-prompts.ts`

## Переменные окружения

Не выводить значения; нужны только имена и назначение:

- `OPENAI_API_KEY` - ключ OpenAI-compatible provider.
- `OPENAI_BASE_URL` - optional base URL, default `https://api.openai.com/v1`.
- `EDUAI_SYNTHETIC_DISABLE_LLM` - отключает LLM в synthetic/self-check путях, где код это учитывает.
- `CHAT_STORE_RAW_CONTENT` - `1` включает raw chat storage; иначе chat content редактируется.
- `JWT_SECRET` - не LLM, но используется как dev fallback secret для dataset pseudonym secret, если `DATASET_EXPORT_SECRET` не задан.
- `DATASET_EXPORT_SECRET` - pseudonymization secret для export.

`OPENAI_MODEL` найден только в `scripts/local-server-env.ts`; runtime LLM callers сейчас передают `gpt-4o-mini` явно.

## Промпты

Seed/default prompt templates:

- `src/lib/prompts.ts`
- `test_generation_v1`
- `chat_system_v1`
- `learning_content_v1`
- `tagger_v1`

Prompt builders:

- `src/lib/llm-prompt-builders.ts`
- `src/lib/episode-generation.ts`

Промпты включают:

- declared preferences отдельно от effective preferences;
- `personalizationReady`;
- subject/topic/section context;
- learner state aggregates для six-factor apply path;
- pedagogical targets (`difficulty`, `depth`);
- constraints против prompt leakage и answer leakage;
- строгие JSON contracts для generation/tagging/learning content.

## Валидация ответа

Provider-level:

- `src/lib/llm/provider.ts` валидирует OpenAI response envelope через Zod (`choices[].message.content`).
- JSON parsing делается в `llmChatJson`/`llmChatJsonWithRaw`.

Caller-level:

- `src/lib/test-schema.ts` - schema теста.
- `src/lib/test-generation.ts` - postprocessing, compliance, retry и fallback decisions.
- `src/lib/llm-tagger.ts` - schema tags и allowed axis/tag validation.
- `src/lib/learning-content-generation.ts` - `LearningContentCardSchema`.

## Фолбэки

Test generation:

- Missing/disabled LLM или provider/schema failure -> `fallbackTest`.
- LLM tagger unavailable/fails/invalid -> rule `tagQuestion`.
- UX delivery compliance может retry; при failure learning может быть excluded.

Learning content:

- Missing/disabled LLM или provider/schema failure -> fallback card.

Episode dialogue:

- Missing/disabled LLM или provider failure -> fallback dialogue reply.

General chat:

- Нет fallback-ответа; LLM failure -> `502 LLM_BAD_RESPONSE`.

## Условия ухода в fallback

- `OPENAI_API_KEY` отсутствует или пустой в путях, где caller явно проверяет доступность.
- `EDUAI_SYNTHETIC_DISABLE_LLM` включен.
- Provider возвращает non-OK status.
- Provider response не проходит envelope schema.
- JSON не парсится.
- Parsed JSON не проходит Zod schema.
- LLM tagger возвращает неподдержанные axes/tags.
- Six-factor artifact disabled/missing/invalid/scoring error -> six-factor fallback bridge, но это не всегда LLM fallback.

## Логирование ошибок LLM

- `src/lib/llm/provider.ts` редактирует provider error text, похожий на `sk-*`, в `[REDACTED_OPENAI_API_KEY]`.
- `src/lib/llm-tagger.ts` логирует `console.error("LLM tagger failed, using fallback", error)`.
- Обычный `/api/chat` ловит LLM error и возвращает generic 502 без подробного server log в этом route.
- `learning-content-generation.ts` и `learning-dialogue.ts` чаще молча уходят в fallback без `console.error`.
- Ошибки storage/evaluation registration возвращаются generic API errors.

# 8. ML/персонализация

## Где находится ML-модель или заглушка

Активный runtime config:

- `configs/active_policy.json`
- Сейчас: `backend.kind = "heuristic_baseline"`, `heuristicPolicyId = "v2_accuracy_beta_duration_unified"`.

Runtime prediction:

- `src/lib/prediction-runtime.ts`
- `src/lib/prediction-feature-layer.ts`
- `src/lib/prediction-duration.ts`
- `src/lib/prediction-ml.ts`
- `src/lib/personalization-runtime.ts`
- `src/lib/recommendation.ts`
- `src/lib/prediction.ts`

Six-factor bridge/artifact:

- `src/lib/ml-six-factor-policy-adapter.ts`
- `src/lib/ml-six-factor-artifact-loader.ts`
- `src/lib/ml-six-factor-runtime-scorer.ts`
- `src/lib/ml-six-factor-apply.ts`
- `src/lib/ml-six-factor-shadow.ts`
- Runtime artifact example: `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`

Python research layer:

- `ml/`
- Contracts: `ml/contracts/**`
- Schemas: `ml/schemas/**`
- Scripts: `ml/scripts/**`
- Tests: `ml/tests/**`

## Входные признаки

Prediction runtime feature payload:

- `subjectId`
- `difficultyTarget`
- `responseFormat`
- `questionCount`
- `currentAtIso`
- history scan до текущего решения
- total learning eligible attempts/questions before decision
- recent accuracy
- time since last attempt
- subject/global clean/fallback windows
- duration telemetry evidence

Accuracy ML feature vector in TS:

- `difficulty_easy`
- `difficulty_hard`
- `question_count_centered`
- `log_total_questions_before`
- `recent_accuracy_centered`
- `recent_accuracy_missing`
- `log_time_since_last_attempt_days`
- `time_since_last_attempt_missing`

Six-factor features:

- prior attempts/correct rate
- recent correct rate
- topic seen count
- minutes since last activity
- session position
- declared preference difficulty/depth
- previous difficulty/depth
- subject/topic/concept/skill/family references
- candidate factor values and interactions inside scorer

## Предсказания/решения

Current prediction runtime outputs:

- `expected_accuracy`
- `expected_total_duration_ms`

Personalization plan chooses:

- pedagogical decision: `difficulty`, `depth`
- rendering/materialization: `tone`, `explanation_style`, `response_format`, presentation/formatting hints
- provenance/runtime metadata

Six-factor bridge can choose/log:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

## Как применяется к промптам/тестам/чату

Test generation:

- `generateTestForUser` получает plan/recommendation, embeds `difficulty`, `depth`, rendering decision and optional six-factor prompt instructions.

Chat:

- `/api/chat` выбирает baseline/self-report/predicted preset, добавляет tone/style/difficulty/depth в system prompt.

Learning content:

- Episode orchestration фиксирует решение, `generateLearningContentForEpisode` materializes content card по тому же plan.

Episode dialogue:

- Dialogue prompt использует context текущего learning content, difficulty/depth/tone/style и optional six-factor apply block.

## Где сохраняются результаты

- Prediction/provenance для generated tests: `GeneratedTest.validationMetaJson`, `recommendationSnapshot`, `profileSnapshotJson`.
- Submit prediction-vs-actual: `TestAttempt.byTagJson._meta`.
- Episode decisions: `EvaluationEpisode.designJson`, `EvaluationEpisodeItem.pedagogicalDecisionJson`, `decisionRuntimeJson`.
- Chat/learning content signals: `ChatMessage.signalsJson`, `ChatSession` prompt/template snapshots.
- User-level preferences: `User.effectivePreferencesJson`, `User.personalizationReady`, `UserTagStat`.

## Что реально работает, а что heuristic/stub/fallback

Реально работает в runtime:

- Heuristic baseline prediction по истории попыток.
- Duration heuristic.
- Rule/materialization layer для rendering decisions.
- Declared preference path.
- Effective preference update по `UserTagStat`.
- Artifact-backed accuracy ML code path, если config переключить на artifact and artifact valid.
- Six-factor shadow/apply integration под env-флагами.

Не является ML:

- `heuristic_baseline` в активном config.
- `stub_model` в `prediction-runtime.ts` - hardcoded weights, явно stub.
- Rule tagger fallback.
- `fallbackTest`, fallback learning content card, fallback dialogue reply.
- Rendering mapping tone/style/format.

Ограничение six-factor:

- Artifact `thu_linear_candidate_scorer_v1` обучен на synthetic THU observations. Он не доказывает real-user educational effect.
- Six-factor apply включается только при `EDUAI_SIX_FACTOR_SHADOW=1` и `EDUAI_SIX_FACTOR_APPLY=1`; ML scoring дополнительно требует `EDUAI_SIX_FACTOR_ML_POLICY=1` и валидный `EDUAI_SIX_FACTOR_ARTIFACT_PATH`.

# 9. Известные проблемные зоны по коду

- Dirty worktree: часть runtime файлов уже изменена до этого документа. Перед багфиксом нужно смотреть текущий diff.
- Stack mismatch: инструкции говорят Next.js 15, package использует Next.js 16.1.3.
- Axis mismatch: research/instructions говорят о 10 axes, runtime `src/lib/tags.ts` и LLM tagger используют 7 legacy axes + `depth`.
- `ml/README.md` частично устарел: говорит no production runtime integration/no delivered-config logging, но TS-код уже имеет optional six-factor integration/logging.
- Активный prediction backend heuristic baseline; риск в UI/docs назвать это ML.
- `/api/chat` не имеет fallback на LLM failure, тогда как test generation/learning content/episode dialogue fallback имеют.
- LLM error logging inconsistent: tagger логирует, многие generation/dialogue paths просто уходят в fallback.
- `OPENAI_MODEL` не используется runtime callers; model hard-coded как `gpt-4o-mini`.
- PromptTemplate seeding lazy; если БД/таблица недоступна, generation/chat paths падают.
- `GET /api/subjects` мутирует БД, мигрируя null collection subjects в default collection.
- PATCH collection/section не умеет очевидно снять parent через `null`.
- `SubjectSection` hard delete может ломать пользовательские ожидания, хотя schema relations ставят `sectionId` в null для tests/episodes.
- Section snapshot hierarchy guard ограничен; слишком глубокие деревья могут быть усечены в snapshot.
- `GeneratedTest.validationMetaJson` и `TestAttempt.byTagJson._meta` несут важные контракты без DB-level schema.
- `TestRunner` не проверяет `response.ok` при submit.
- `POST /api/tests/generate` парсит Zod payload вне `try`, invalid payload может уходить в framework-level error.
- `buildFallbackRecommendation` в provenance ставит `fallbackUsed: false`, хотя notes говорят baseline bridge preset applied; это может путать аудит.
- `User.testsTaken` увеличивается только для learning-eligible attempts, не для всех attempts.
- Chat UX stats может менять `UserTagStat`/effective preferences, хотя chat secondary signal.
- `/api/chat` создает новый `ChatSession` на каждый turn; это не continuous general chat session.
- В `/api/chat` `sessionMeta` при `storeChatTurn` не передает `subjectId`, хотя prompt context его знает; subject-scoped chat analytics могут быть неполными.
- API error shape неоднороден: местами flat `{ error, message }`, местами `{ ok:false, error:{ code, message } }`.
- `/api/users/me/stats` выглядит старее dashboard/learner-truth и может расходиться по метрикам.
- RateLimitBucket cleanup opportunistic; отдельного scheduled cleanup не найдено.
- Admin `/api/evaluation/episodes` list path user-scoped; admin episode UI может показывать workspace текущего admin user, а не все users, если не использует отдельный export/observability path.
- LLM fallback tests сохраняются как normal artifacts, но learning exclusion происходит позже на submit; пользователь может не понимать data-quality статус до результата.

# 10. Мини-глоссарий проекта

Эпизод:

- `EvaluationEpisode` - связанный обучающий цикл с precheck/content/postcheck/holdout/delayed steps, предназначенный для replay-safe evaluation.

Предмет:

- `Subject` - пользовательская учебная тема/предмет верхнего уровня. В UI часто отображается как topic/subject.

Тема:

- В коде термин может значить `Subject.title`, `SubjectSection`, `GeneratedTest.topic` или episode `topic`. Для багфиксов всегда проверять конкретное поле/route.

Профиль:

- UI и API слой для account name, declared preferences, effective preferences, prediction notes, research consent и learner truth summary.

Предпочтения:

- Declared preferences: пользователь явно выбрал.
- Effective preferences: система оценила по behavior/performance data.
- Inferred preference как отдельное runtime-поле явно не выделено в Prisma; близкие данные живут в `UserTagStat`, predictions и learner truth metadata.

Политика персонализации:

- Versioned decision path, который выбирает baseline/self-report/predicted runtime и фиксирует provenance (`policyId`, backend kind/id/status, selection mode).

Learning gain:

- Целевой образовательный эффект. В текущем baseline proxy используется next-task success/accuracy; время является вторичной метрикой или constraint.

Фолбэк:

- Явная запасная логика при недоступной LLM/ML/artifact/schema или недостатке данных: fallback test/card/dialogue, rule tagger, heuristic baseline, static/heuristic six-factor bridge.

Исследовательский режим:

- В коде представлен dataset/evaluation/export/admin/self-check/six-factor pilot paths. Не является обычным learner-facing режимом по умолчанию.

Обучающий режим:

- `Learn`/episodes: canonical learner surface для structured learning content, dialogue and checks.

Обычный режим:

- Standard learner UI без явного research/admin контекста: topics, practice, chat, profile, analytics. В API personalization может быть `on`/`off`.

# 11. Что нужно прикладывать к будущему баг-репорту

Шаблон:

```markdown
## Что сломано
Кратко: что пользователь видит или какой контракт нарушен.

## Где
- UI route:
- API route:
- Компонент/модуль:
- Таблицы/records, если известно:

## Как воспроизвести
1. ...
2. ...
3. ...

## Что ожидалось
...

## Что происходит
...

## Среда
- local или Vercel:
- branch/commit или `git status --short`:
- browser, если UI bug:
- user role: обычный/admin:

## Логи без секретов
- Browser console:
- Network request/response status:
- Server terminal log:
- Relevant traceId, если route его вернул:
- Prisma/DB error code, если есть:

## Env-переменные, которые проверить без раскрытия значений
- `DATABASE_URL`: задан/не задан, указывает на нужную БД.
- `DIRECT_URL`: задан/не задан для миграций.
- `JWT_SECRET`: задан; не `dev-secret` в production.
- `OPENAI_API_KEY`: задан/не задан.
- `OPENAI_BASE_URL`: задан/не задан, корректный URL.
- `CHAT_STORE_RAW_CONTENT`: `0` или `1`.
- `DATASET_EXPORT_SECRET`: задан для export.
- `EDUAI_SYNTHETIC_DISABLE_LLM`: включен/выключен.
- `EDUAI_SIX_FACTOR_SHADOW`: включен/выключен.
- `EDUAI_SIX_FACTOR_ML_POLICY`: включен/выключен.
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH`: задан/не задан, artifact существует.
- `EDUAI_SIX_FACTOR_APPLY`: включен/выключен.

## Данные для воспроизведения
- user id/email без пароля:
- subject id:
- section id:
- test id:
- evaluation episode id:
- chat session id:
- request payload без секретов:
- response body без секретов:
```
