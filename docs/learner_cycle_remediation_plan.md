# Learner Cycle Remediation Plan

## 0. Проверка постановки задачи и принятые допущения

- Неоднозначность: `полный learner-cycle` можно понимать как UX-склейку экранов или как более широкий redesign runtime ownership. В этом плане scope уже зафиксирован уже собранным аудитом и текущим кодом: цель состоит в том, чтобы собрать цельный learner-flow поверх существующего episode-first ядра, а не перепроектировать весь продукт и не объявлять runtime model-owned.
- Чего не хватает: в рабочем дереве отсутствуют `docs/audit_bundle_manifest.md` и `docs/audit_bundle_notes.md`, хотя они указаны как входные источники. Поэтому план опирается на доступные audit-документы (`docs/user_flow_audit.md`, `docs/current_product_operating_model.md`, `docs/single_user_simulation_plan.md`, `docs/single_user_simulation_report.md`) и на текущий код как на главный источник истины.
- Риск ложного плана: легко перепутать симптомы с корнем и начать с визуальной полировки, admin-surfaces или prediction-layer. Это даст более гладкую оболочку, но не исправит разрыв между `Topics`, `Learn`, `Practice`, `Analytics`, `Profile`, `StatusPanel`, auth и evidence semantics.
- Принятые допущения: `Learn` остаётся каноническим основным путём; `Topics` остаётся обязательной предпосылкой первого осмысленного цикла; `Practice` сохраняется как вторичная ветка; текущая active policy в `configs/active_policy.json` честно считается heuristic baseline; remediation идёт staged, без большого route audit и без переписывания ML-layer.

## 1. Краткий диагноз текущего состояния

Текущий learner-cycle уже существует как частично рабочий контур: `Auth -> Learn -> Topics -> Learn episode -> Practice/Test -> Analytics/Profile -> repeat`.

Он считается частично рабочим, потому что реальный пользователь уже может создать тему, стартовать episode, пройти `precheck`, дойти до `learning content` и `postcheck`, отдельно пройти standalone `Practice`, затем открыть `Analytics` и `Profile`.

Он ещё не цельный, потому что продукт не оркестрирует обязательный первый шаг, не держит единую product truth по learner metrics, не прозрачен в том, что именно считается learning evidence, и скрывает ключевое stateful поведение вроде auto-resume active episode.

## 2. Канонический целевой learner-цикл

Ближайшая реалистичная цель, подтверждаемая текущей архитектурой, должна выглядеть так:

`Register/Login -> first-run routing -> Topics -> Topic detail / subtopic setup -> Learn episode -> precheck -> learning content/dialogue -> postcheck/holdout -> Analytics/Profile -> repeat Learn`

Уточнения по роли поверхностей:

- `Learn` остаётся каноническим owner-path для основного episode-first learning loop.
- `Topics` становится обязательным first-run и repeat-run entry surface для выбора и структурирования предметной области, а не побочным экраном, о котором пользователь должен догадаться сам.
- `Practice` остаётся вторичной веткой для direct custom set и не конкурирует с `Learn` за роль главного пути.
- `Analytics` и `Profile` остаются post-action/read surfaces, которые должны объяснять текущее состояние learner-а и следующий шаг, а не создавать параллельную правду.
- Resume незавершённого episode остаётся допустимым, но становится явным сценарием с понятной причиной и выбором пользователя.

## 3. Список корневых причин, а не только симптомов

### Orchestration / navigation

- Корень: канонический порядок поверхностей не закреплён в product flow. Auth, home CTA, topic CTA и nav ведут в разные места, хотя фактически `Topics` является обязательной предпосылкой, а `Learn` является owner-path.
- Подтверждение: audit и simulation фиксируют `after-auth -> /learn`, необходимость самому понять, что сначала нужны `Topics`, и несовпадение смысла `Start episode` с фактическим поведением.
- Связанные части кода:
  - `src/app/(main)/login/page.tsx`
  - `src/app/(main)/register/page.tsx`
  - `src/app/(main)/page.tsx`
  - `src/app/AppShellNav.tsx`
  - `src/app/AuthGate.tsx`
  - `src/app/(main)/topics/[topicId]/page.tsx`
  - `src/app/(main)/practice/page.tsx`
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`

### Data consistency

- Корень: learner metrics собираются из разных моделей и с разной семантикой, без единого owner-contract. Одни экраны читают `user.testsTaken`, другие считают реальные `testAttempt`, третьи строят прогнозы по subject-context, четвёртые исключают default collection.
- Подтверждение: simulation уже зафиксировала расхождения между `Analytics`, `Profile`, `StatusPanel` и topic-related screens; audit отдельно отмечает межэкранную несогласованность.
- Связанные части кода:
  - `src/app/StatusPanel.tsx`
  - `src/app/api/users/me/route.ts`
  - `src/lib/profile.ts`
  - `src/app/api/users/me/profile/route.ts`
  - `src/app/api/users/me/dashboard/route.ts`
  - `src/app/api/users/me/predictions/route.ts`
  - `src/app/api/subjects/[subjectId]/stats/route.ts`
  - `src/app/api/tests/[id]/submit/route.ts`
  - `src/lib/collection-constants.ts`
  - `src/lib/collections.ts`

### Evidence semantics / learning updates

- Корень: текущий runtime записывает попытку как факт действия пользователя, но затем может исключить её из learning updates, при этом продуктово не удерживает ясное различие между `attempt recorded`, `learning eligible`, `counts toward adaptive state` и `counts toward screen-level stats`.
- Подтверждение: simulation прямо показала `recorded` одновременно с `Excluded from learning updates`; пользователь видит результат, но не понимает, что реально вошло в основной контур.
- Связанные части кода:
  - `src/app/api/tests/[id]/submit/route.ts`
  - `src/app/(main)/tests/[id]/TestRunner.tsx`
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/lib/learning-episode.ts`
  - `src/lib/recommendation.ts`
  - `src/lib/personalization-runtime.ts`
  - `configs/active_policy.json`

### State management / resume behavior

- Корень: `Learn` скрыто восстанавливает active episode из query, `localStorage` и API последнего active episode, но это техническая механика, а не явный продуктовый сценарий. Пользователь попадает в середину пути без объяснения, выбора и явной разницы между `resume` и `start new`.
- Подтверждение: audit и simulation отдельно фиксируют hidden resume behavior и отсутствие ясного объяснения, почему экран открылся не с начала.
- Связанные части кода:
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/lib/learner-episode-client.ts`
  - `src/app/api/evaluation/episodes/route.ts`
  - `src/app/api/evaluation/episodes/[id]/route.ts`
  - `src/app/api/evaluation/episodes/[id]/next/route.ts`
  - `src/lib/learning-episode.ts`

### Performance and waiting states

- Корень: длинные synchronous generation/materialization steps остаются реальными runtime-блоками, но UI в основном маскирует их общими loading-состояниями и ручными `continue` шагами без хорошего сценарного объяснения.
- Подтверждение: simulation зафиксировала длинные переходы на старте episode, materialization learning content, переходе к `postcheck` и генерации standalone practice set.
- Связанные части кода:
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/app/(main)/practice/page.tsx`
  - `src/app/(main)/topics/[topicId]/page.tsx`
  - `src/app/api/evaluation/episodes/route.ts`
  - `src/app/api/evaluation/episodes/[id]/next/route.ts`
  - `src/app/api/tests/generate/route.ts`
  - `src/lib/learning-episode.ts`
  - `src/lib/test-generation.ts`

### Naming / IA confusion

- Корень: IA и naming продолжают одновременно утверждать, что `Learn` каноничен, и продвигать `Practice` как почти равный основной путь. Дополнительно `Start episode` означает не старт episode, а переход на предзаполненный `Learn`.
- Подтверждение: audit и simulation оба отмечают конкуренцию `Practice` против `Learn`, а также ложную семантику `Start episode`.
- Связанные части кода:
  - `src/app/AppShellNav.tsx`
  - `src/app/(main)/topics/[topicId]/page.tsx`
  - `src/app/(main)/practice/page.tsx`
  - `src/app/(main)/tests/[id]/TestRunner.tsx`
  - `src/app/(main)/page.tsx`
  - redirect-alias routes under `src/app/(main)/**`

### Auth / rate-limit / session friction

- Корень: auth и protection уже реально вмешиваются в learner-cycle, но flow не учитывает их как часть продукта. После login/register нет return contract и state-aware routing; route guards просто выбрасывают пользователя в `/login` или `/learn`; rate limit уже влияет на обычный learner-flow.
- Подтверждение: audit и simulation зафиксировали auth-bounce и реальные `429`; prompt пользователя отдельно указал, что auth/rate-limit уже влияют на реальную эксплуатацию.
- Связанные части кода:
  - `src/app/AuthGate.tsx`
  - `src/app/(main)/login/page.tsx`
  - `src/app/(main)/register/page.tsx`
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/register/route.ts`
  - `src/lib/auth.ts`
  - `src/lib/rate-limit.ts`
  - `src/app/api/evaluation/episodes/route.ts`
  - `src/app/api/tests/generate/route.ts`
  - `src/app/api/tests/[id]/submit/route.ts`

## 4. Целевой порядок исправления

### Этап 1. Зафиксировать канонический learner-flow contract

- Цель этапа: убрать продуктовую двусмысленность, что является first-run и owner-path.
- Что именно меняется:
  - фиксируется один канонический путь `Auth -> Topics -> Learn -> Analytics/Profile -> repeat`;
  - определяется state-aware rule после auth: новый learner без subjects уходит в `Topics`, learner с активным episode получает явный resume path, learner со структурой и без active episode уходит в `Learn`;
  - перестают существовать CTA и redirects, которые молча противоречат этому порядку.
- Какие файлы/модули затрагиваются:
  - `src/app/(main)/login/page.tsx`
  - `src/app/(main)/register/page.tsx`
  - `src/app/AuthGate.tsx`
  - `src/app/(main)/page.tsx`
  - `src/app/AppShellNav.tsx`
  - `src/app/api/subjects/route.ts`
  - `src/app/api/evaluation/episodes/route.ts`
- Почему этот этап должен идти раньше следующих: без него команда будет продолжать одновременно чинить два конкурирующих сценария и спорить, что считать нормальным поведением.
- Какой риск он снимает: ложная стабилизация неправильного маршрута `after-auth -> /learn`.
- Как проверить, что этап завершён:
  - новый пользователь после register/login не попадает в тупик;
  - state-aware redirect воспроизводим и объясним;
  - канонический путь не требует догадки про `Topics`.

### Этап 2. Пересобрать orchestration между `Topics`, `Learn` и `Practice`

- Цель этапа: сделать `Topics` реальным входом в учебный цикл, `Learn` реальным owner-path, а `Practice` явной secondary branch.
- Что именно меняется:
  - `Start episode` в topic-related surfaces начинает означать ровно то, что написано;
  - topic detail перестаёт быть полу-переходом в предзаполненный `Learn`;
  - `Practice` получает роль explicit custom practice branch, не masquerading as peer to `Learn`;
  - secondary actions и copy перестают ставить `Practice` и `Learn` в конкурентные позиции.
- Какие файлы/модули затрагиваются:
  - `src/app/(main)/topics/page.tsx`
  - `src/app/(main)/topics/[topicId]/page.tsx`
  - `src/app/(main)/learn/page.tsx`
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/app/(main)/practice/page.tsx`
  - `src/app/(main)/tests/[id]/TestRunner.tsx`
  - `src/lib/recommendation.ts`
- Почему этот этап должен идти раньше следующих: сначала нужно вернуть корректный narrative owner-path, иначе последующая работа по данным и ожиданиям будет отображаться в неправильной IA.
- Какой риск он снимает: усиление конкуренции `Practice` против `Learn`.
- Как проверить, что этап завершён:
  - из `Topics` можно однозначно запустить основной путь;
  - пользователь понимает разницу между episode-first learning и custom practice;
  - CTA semantics совпадает с фактическим действием.

### Этап 3. Выпрямить evidence semantics и learning update contract

- Цель этапа: отделить факт попытки, eligibility для learning updates, участие в adaptive state и участие в learner-facing counters.
- Что именно меняется:
  - вводится один явный contract, что считается:
    - recorded attempt,
    - eligible learning evidence,
    - excluded attempt,
    - episode primary signal,
    - secondary/supporting signal;
  - UI больше не показывает успешную запись результата как эквивалент полного обновления learner state;
  - exclusion reason становится частью прозрачной product semantics, а не только технического warning.
- Какие файлы/модули затрагиваются:
  - `src/app/api/tests/[id]/submit/route.ts`
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/app/(main)/tests/[id]/TestRunner.tsx`
  - `src/lib/learning-episode.ts`
  - `src/lib/evaluation.ts`
  - `src/lib/personalization-runtime.ts`
- Почему этот этап должен идти раньше следующих: невозможно выровнять цифры и profile/dashboard truth, пока не решено, что продукт вообще считает основным сигналом.
- Какой риск он снимает: косметическое объяснение exclusions без исправления их роли в product truth.
- Как проверить, что этап завершён:
  - для любого test outcome можно однозначно ответить, был ли он recorded, learning-eligible и почему;
  - learner-facing copy не противоречит backend semantics;
  - standalone `Practice` и episode checks имеют явную, а не подразумеваемую связь с adaptive state.

### Этап 4. Выравнять shared learner truth across screens

- Цель этапа: привести `StatusPanel`, `Profile`, `Analytics`, topic stats и related screens к одному согласованному набору базовых learner metrics.
- Что именно меняется:
  - определяется canonical source для:
    - total attempts,
    - learning-eligible attempts,
    - excluded attempts,
    - current difficulty target,
    - expected accuracy,
    - subject-level recent evidence;
  - убираются расхождения между `user.testsTaken`, агрегатами из `testAttempt`, profile summaries и subject stats;
  - default collection handling перестаёт неожиданно выбрасывать тему из части экранов, сохраняя при этом скрытую жизнь в других.
- Какие файлы/модули затрагиваются:
  - `src/app/StatusPanel.tsx`
  - `src/app/api/users/me/route.ts`
  - `src/lib/profile.ts`
  - `src/app/api/users/me/profile/route.ts`
  - `src/app/api/users/me/dashboard/route.ts`
  - `src/app/api/users/me/predictions/route.ts`
  - `src/app/api/subjects/[subjectId]/stats/route.ts`
  - `src/app/(main)/analytics/page.tsx`
  - `src/app/(main)/profile/page.tsx`
  - `src/lib/collection-constants.ts`
  - `src/lib/collections.ts`
- Почему этот этап должен идти раньше следующих: repeat cycle останется недостоверным, если соседние экраны продолжают рассказывать разные версии реальности.
- Какой риск он снимает: скрытое маскирование inconsistency вместо выравнивания источников правды.
- Как проверить, что этап завершён:
  - базовые learner metrics совпадают по смыслу и значению на ключевых learner screens;
  - excluded attempts либо последовательно учитываются как `attempted but excluded`, либо последовательно не смешиваются с learning-eligible counts;
  - тема в default collection не ведёт к неожиданно нулевой статистике на одних экранах и ненулевой на других.

### Этап 5. Сделать resume и repeat cycle явными и безопасными

- Цель этапа: убрать скрытую state-механику из `Learn` и превратить её в явный продуктовый сценарий повторного использования.
- Что именно меняется:
  - auto-resume больше не подменяет silently стартовый сценарий;
  - пользователь видит явное различие между `resume active episode`, `start new episode` и `go to Topics`;
  - localStorage, URL `?episode=` и server-side active episode reconciliation перестают неожиданно конкурировать друг с другом.
- Какие файлы/модули затрагиваются:
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/lib/learner-episode-client.ts`
  - `src/app/api/evaluation/episodes/route.ts`
  - `src/app/api/evaluation/episodes/[id]/route.ts`
  - `src/app/api/evaluation/episodes/[id]/next/route.ts`
  - `src/lib/learning-episode.ts`
- Почему этот этап должен идти раньше следующих: repeat cycle является критерием целостности продукта; без него первый проход можно пригладить, но обычное использование всё равно останется хрупким.
- Какой риск он снимает: поломка resume behavior при поверхностной навигационной чистке.
- Как проверить, что этап завершён:
  - возврат в `Learn` после незавершённого episode предсказуем;
  - новый цикл не теряет контекст и не перехватывается скрытым старым episode;
  - deep link, local resume и explicit start не конфликтуют.

### Этап 6. Убрать непрозрачные waiting states и operational friction

- Цель этапа: сделать реальные долгие операции и rate-limit/session friction частью управляемого flow, а не источником ощущения зависания.
- Что именно меняется:
  - долгие steps (`episode start`, `materialization`, `next`, `practice generate`) получают понятные сценарные статусы;
  - пользователь понимает, что происходит сейчас, чего ждать дальше и когда это временная операционная задержка;
  - auth/rate-limit ошибки перестают выбрасывать пользователя из learner-cycle без recovery path.
- Какие файлы/модули затрагиваются:
  - `src/components/learner/LearnerEpisodeWorkspace.tsx`
  - `src/app/(main)/practice/page.tsx`
  - `src/app/(main)/topics/[topicId]/page.tsx`
  - `src/app/(main)/login/page.tsx`
  - `src/app/(main)/register/page.tsx`
  - `src/app/AuthGate.tsx`
  - `src/lib/rate-limit.ts`
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/auth/register/route.ts`
  - `src/app/api/evaluation/episodes/route.ts`
  - `src/app/api/tests/generate/route.ts`
  - `src/app/api/tests/[id]/submit/route.ts`
- Почему этот этап должен идти после предыдущих: сначала нужно стабилизировать сам сценарий и truth semantics, иначе улучшение waiting UX будет обёрткой поверх неправильного процесса.
- Какой риск он снимает: ощущение, что learner-flow “работает, если повезёт”.
- Как проверить, что этап завершён:
  - пользователь не путает долгую генерацию с зависанием;
  - 401/429 сценарии имеют понятный recovery path;
  - auth/session friction больше не ломает непрерывный smoke path.

### Этап 7. Финальная IA-зачистка и readiness verification

- Цель этапа: после исправления core-flow убрать остаточную путаницу в alias/copy и формально подтвердить цельность learner-cycle.
- Что именно меняется:
  - secondary aliases и misleading labels приводятся в соответствие фактическому ownership flow;
  - docs по learner-flow обновляются под исправленное состояние;
  - проводится повторная single-user simulation и cross-screen consistency pass.
- Какие файлы/модули затрагиваются:
  - learner-facing routes under `src/app/(main)/**`
  - `src/app/AppShellNav.tsx`
  - `docs/current_product_operating_model.md`
  - `docs/single_user_simulation_plan.md`
  - `docs/single_user_simulation_report.md`
  - при необходимости `docs/API_REFERENCE.md` и `docs/ARCHITECTURE.md`
- Почему этот этап идёт последним: он должен зафиксировать уже исправленную truth, а не подменить её.
- Какой риск он снимает: возврат хаоса через stale docs и legacy naming.
- Как проверить, что этап завершён:
  - learner-flow проходит как единый сценарий без product-level contradictions;
  - документы и runtime совпадают;
  - Codex можно запускать по этапам remediation без повторного большого аудита.

## 5. P0 / P1 / P2 backlog

### P0

- Исправить post-auth routing contract.
  - Почему P0: это первый разрыв learner-cycle.
  - Похоже на файлы/модули: `src/app/(main)/login/page.tsx`, `src/app/(main)/register/page.tsx`, `src/app/AuthGate.tsx`.
  - Критерий закрытия: новый learner после auth получает корректный следующий шаг, а не тупик в `Learn`.

- Привести `Start episode` semantics в соответствие фактическому действию.
  - Почему P0: это прямой обман ожидания в основном пути.
  - Похоже на файлы/модули: `src/app/(main)/topics/[topicId]/page.tsx`, `src/components/learner/LearnerEpisodeWorkspace.tsx`.
  - Критерий закрытия: CTA либо действительно стартует episode, либо явно называется переходом в `Learn`.

- Зафиксировать contract между `Learn` и `Practice`.
  - Почему P0: пока это не сделано, продукт имеет два конкурирующих “ядра”.
  - Похоже на файлы/модули: `src/app/(main)/practice/page.tsx`, `src/app/AppShellNav.tsx`, `src/app/(main)/tests/[id]/TestRunner.tsx`.
  - Критерий закрытия: learner однозначно понимает, что `Learn` canonical, а `Practice` secondary.

- Нормализовать evidence semantics и exclusions.
  - Почему P0: без этого learner-cycle остаётся нечестным по смыслу.
  - Похоже на файлы/модули: `src/app/api/tests/[id]/submit/route.ts`, `src/components/learner/LearnerEpisodeWorkspace.tsx`, `src/app/(main)/tests/[id]/TestRunner.tsx`.
  - Критерий закрытия: продукт явно объясняет, что было записано и что вошло в learning updates.

- Выравнять базовые learner counters между `StatusPanel`, `Profile`, `Analytics` и topic stats.
  - Почему P0: противоречивая truth делает пост-цикл недостоверным.
  - Похоже на файлы/модули: `src/app/StatusPanel.tsx`, `src/lib/profile.ts`, `src/app/api/users/me/route.ts`, `src/app/api/users/me/dashboard/route.ts`, `src/app/api/subjects/[subjectId]/stats/route.ts`.
  - Критерий закрытия: базовые числа не противоречат друг другу на ключевых экранах.

### P1

- Сделать resume active episode явным продуктовым сценарием.
  - Почему P1: основной путь возможен и сейчас, но repeat-run остаётся скрыто хрупким.
  - Похоже на файлы/модули: `src/components/learner/LearnerEpisodeWorkspace.tsx`, `src/lib/learner-episode-client.ts`.
  - Критерий закрытия: возвращение в `Learn` не удивляет и не ломает ожидание пользователя.

- Убрать непрозрачные waiting states для long-running steps.
  - Почему P1: цикл работает, но воспринимается как зависающий.
  - Похоже на файлы/модули: `src/components/learner/LearnerEpisodeWorkspace.tsx`, `src/app/(main)/practice/page.tsx`, `src/app/api/tests/generate/route.ts`.
  - Критерий закрытия: длинные шаги объясняются и дают понятный следующий исход.

- Исправить default collection trap.
  - Почему P1: это уже влияет на stats/evidence semantics, но после фиксации core truth её проще привести в порядок.
  - Похоже на файлы/модули: `src/app/api/subjects/route.ts`, `src/app/api/subjects/[subjectId]/stats/route.ts`, `src/lib/collections.ts`, `src/lib/collection-constants.ts`.
  - Критерий закрытия: learner не может случайно создать тему в продуктово “псевдо-базовом” состоянии, которое ломает ожидания статистики.

- Добавить auth/rate-limit recovery path в learner-flow.
  - Почему P1: эксплуатационно важно, но не первичный owner-contract.
  - Похоже на файлы/модули: `src/app/AuthGate.tsx`, `src/lib/rate-limit.ts`, auth routes, episode/test routes.
  - Критерий закрытия: 401/429 больше не обрывают цикл без понятного продолжения.

### P2

- Приземлить `Analytics` до честного overview и next-action surface.
  - Почему P2: не блокирует сам цикл, если truth уже выровнена.
  - Похоже на файлы/модули: `src/app/(main)/analytics/page.tsx`, dashboard cards.
  - Критерий закрытия: экран честно показывает обзор и следующий шаг, не обещая глубины, которой нет.

- Очистить legacy aliases и остаточную naming confusion.
  - Почему P2: это финальная сборка IA, не блокер ядра.
  - Похоже на файлы/модули: alias routes in `src/app/(main)/**`, `src/app/AppShellNav.tsx`.
  - Критерий закрытия: alias routes не создают иллюзию отдельных продуктовых веток.

- Обновить supporting docs под исправленный learner-flow.
  - Почему P2: документальная честность важна, но только после изменения runtime truth.
  - Похоже на файлы/модули: `docs/current_product_operating_model.md`, `docs/single_user_simulation_*`, при необходимости `docs/ARCHITECTURE.md`.
  - Критерий закрытия: документация не расходится с исправленным runtime.

## 6. Что НЕ надо чинить первым

- Не делать большой визуальный рефакторинг `Learn`, `Practice`, `Analytics` или `Profile` до фиксации orchestration и truth contracts. Сейчас блокер не в том, что экраны “некрасивые”, а в том, что они конфликтуют по смыслу.
- Не уходить в admin/operator surfaces раньше learner-cycle. `Admin` полезен для наблюдаемости, но не является owner-blocker для текущего learner-flow.
- Не переписывать всю prediction layer или не пытаться срочно “сделать ML по-настоящему” раньше выравнивания learner truth. Текущий heuristic baseline честно зафиксирован, а текущий блокер находится в orchestration, evidence semantics и cross-screen consistency.
- Не строить новую глубокую аналитику до нормализации существующих learner counters и screen contracts. Иначе продукт только нарастит количество противоречий.
- Не менять весь data model wholesale, если конкретная проблема решается tighter contracts над уже существующими `EvaluationEpisode`, `GeneratedTest`, `TestAttempt`, `User`, `Subject`.
- Не расширять `Practice` как самостоятельный продукт, пока не зафиксирован его подчинённый статус относительно канонического `Learn`.

## 7. Риски неправильного исправления

- Косметически пригладить flow без смены owner-contract.
  - Результат: после auth и дальше пользователь будет по-прежнему идти по неверному или двусмысленному сценарию, только с более красивым copy.

- Скрыть data inconsistency вместо выравнивания источников правды.
  - Результат: цифры станут менее заметно конфликтовать, но analytics, profile и status продолжат считать разное.

- Сделать `Practice` ещё более самостоятельным.
  - Результат: продукт закрепит два конкурирующих learner narratives и осложнит интерпретацию evidence.

- Сломать resume behavior при попытке упростить `Learn`.
  - Результат: повторный цикл начнёт терять active episode или, наоборот, будет навязчиво захватывать пользователя старым state.

- Обойти exclusions текстом, а не semantics.
  - Результат: learner по-прежнему не будет понимать, что реально влияет на adaptive state, просто предупреждение станет длиннее.

- Считать `testsTaken` и подобные counters “достаточно хорошими” без пересмотра их update semantics.
  - Результат: часть экранов будет опираться на агрегаты попыток, а часть на селективно обновляемый user-level cache.

- Ухудшить auth friction, добавив больше guard-redirect logic без return contract.
  - Результат: learner-flow станет ещё более хрупким в 401/429 и multi-step сценариях.

## 8. Минимальные acceptance criteria для “целостный learner-cycle починен”

- Новый пользователь после register/login получает корректный следующий шаг и не обязан догадываться, что сначала нужны `Topics`.
- Из `Topics` можно осмысленно перейти в канонический `Learn` path без misleading CTA semantics.
- Пользователь понимает, когда результат просто записан, когда он вошёл в learning updates и почему попытка могла быть исключена.
- `Learn`, `Practice`, `Analytics`, `Profile`, `StatusPanel` и topic-related screens не противоречат друг другу по базовым learner metrics и subject-level history.
- Возврат в `Learn` после незавершённого episode предсказуем: продукт либо явно предлагает resume, либо явно предлагает новый старт.
- Повторный цикл действительно продолжает историю learner-а, а не создаёт новый параллельный нарратив.
- Долгие transitions не выглядят как зависание и не оставляют пользователя без понимания следующего шага.
- Auth/rate-limit проблемы больше не разрывают основной smoke path без понятного recovery behavior.

## 9. Предлагаемая стратегия проверки после исправлений

- Основной smoke path:
  - `Register/Login -> Topics -> create group/topic/subtopic -> Learn start -> precheck submit -> learning content/dialogue -> postcheck -> Analytics -> Profile -> return to Learn`.

- Обязательная повторная single-user simulation:
  - использовать тот же контур, что уже проверялся в `docs/single_user_simulation_plan.md`, но теперь отдельно фиксировать:
    - first-run routing,
    - semantics `Start episode`,
    - exclusion transparency,
    - repeat-run resume behavior,
    - cross-screen truth after first recorded and after first excluded attempt.

- Cross-screen consistency checks:
  - сравнить `StatusPanel`, `Profile/Account`, `Profile/System`, `Analytics`, `Topics/[topicId]` по:
    - total attempts,
    - learning-eligible attempts,
    - excluded attempts,
    - current difficulty target,
    - subject-level recent evidence.

- Обязательные маршруты и состояния для перепроверки:
  - `/login`
  - `/register`
  - `/topics`
  - `/topics/[topicId]`
  - `/learn`
  - `/learn?episode=...`
  - `/practice`
  - `/tests/[id]`
  - `/analytics`
  - `/profile`
  - 401/429 responses for auth, episode start, test generate, test submit

- Проверка operational truth:
  - убедиться, что heuristic baseline в `configs/active_policy.json` по-прежнему честно отражён как baseline, а не маскируется под новый “исправленный умный runtime”.

## 10. Итоговый вердикт

Текущий код достаточно близок к исправимому цельному learner-cycle, потому что episode-first ядро, practice branch, learner surfaces и evaluation/data contracts уже существуют и реально работают.

Это не локальная правка в одном экране, но и не полное перепроектирование продукта. Правильное описание масштаба: staged remediation с частичной пересборкой flow orchestration и truth contracts поверх существующего runtime.

Правильный общий подход: не большой rewrite, а последовательный repair of ownership, semantics and product truth. Сначала закрепить канонический путь и meaning of evidence, затем выровнять shared data truth, затем стабилизировать resume/waiting/auth friction. Это самый короткий путь от частично работающего прототипа к цельному learner-flow.
