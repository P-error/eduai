# Аудит пользовательского интерфейса и маршрутов EduAI

## 1. Проверка постановки задачи и промпта

### Что в задаче неоднозначно

- Формулировка `все доступные пользовательские маршруты` может означать только learner-контур или вообще все экраны, которые может открыть человек при разных ролях. В этом аудите я включаю гостевые, learner, demo и admin-маршруты, потому что они реально доступны пользователям в текущем продукте при разных состояниях auth и role.
- Формулировка `страница/экран` в текущем приложении недостаточна без уточнения про составные состояния. Я считаю отдельными экранами не только route-level pages, но и materially different internal states внутри `/learn`, `/profile`, `/practice`, `/topics/[topicId]` и `/demo`.
- Не было явного списка тестовых учётных записей и ролей. Для практической проверки я использовал регистрацию нового пользователя через UI и существующие локальные данные/роли из текущего состояния среды.

### Чего не хватает для идеально точного результата

- Списка эталонных аккаунтов: `guest`, `new learner`, `filled learner`, `admin`.
- Зафиксированного seed-набора данных, относительно которого надо считать продуктовое поведение «нормальным».
- Отдельной QA-среды без накопленных локальных состояний браузера: `localStorage`, cookie-предпочтений, автоматически восстановленного active episode.
- Явного решения, считать ли operator/admin контур частью продуктового пользовательского ландшафта для владельца продукта. В этом документе он включён, но отделён от learner-контура.

### Риски ложного вывода

- Один и тот же route может выглядеть радикально по-разному в зависимости от auth, admin role, наличия topics, history, query params и `localStorage`.
- `/learn` умеет автоматически восстанавливать активный episode по `?episode=...`, из `localStorage` или через API активного episode; из-за этого стартовый экран не всегда показывается.
- Часть аналитических экранов зависит от текущего наполнения БД и текущего положения topic в коллекции.
- Некоторые долгие состояния реально существуют, но тяжело полностью пройти вживую в пределах одного аудита: `waiting_delay`, поздний holdout, части admin destructive flows.
- Несколько маршрутов формально существуют, но фактически являются только alias/redirect и не дают собственного экрана.

### Зафиксированные допущения

- Аудит относится к текущему локальному приложению на `http://localhost:3000`.
- В scope входят guest, learner, demo и admin-поведения.
- `Доступно пользователю` означает: доступно через явную навигацию, redirect, deep link или прямой URL при наличии корректного auth/state/role.
- Если состояние не удалось полностью пройти живьём, оно помечено как `Проверено по коду` и не выдаётся за полностью runtime-подтверждённое.
- Существующие локальные seed-данные считаются частью текущего состояния продукта, но не универсальной гарантией для пустой БД.

## 2. Краткое описание текущего пользовательского контура

Сейчас EduAI выглядит как рабочее пространство вокруг пяти learner-разделов: `Profile`, `Learn`, `Practice`, `Analytics`, `Topics`. Для гостя доступны только лендинг `/`, auth-страницы `/login` и `/register`, а также скрытый демонстрационный маршрут `/demo`. Для авторизованного learner основной контур выглядит так: создать topic -> запустить `Learn` episode или `Practice` set -> посмотреть `Analytics` -> возвращаться в `Topics` и `Profile`.

Это не «чатовый» продукт в интерфейсном смысле. Отдельного пользовательского route `/chat` как самостоятельного экрана нет: `/chat` только редиректит в `/learn`, а сам диалог живёт как один из внутренних шагов episode. `Learn` является каноническим episode-first маршрутом. `Practice` даёт отдельный custom set без полного episode loop. `Analytics` сейчас больше похож на обзорный read-only dashboard, чем на глубокую навигационную ветку.

Отдельно существует крупный admin-контур. Он технически реален и доступен admin-пользователю, но плохо встроен в основную навигацию: из UI обнаруживаются только `/admin`, `/admin/episodes` и `/admin/prompt-templates`, тогда как остальные admin dashboards открываются фактически только по прямому URL.

### Сводка по route-level inventory

| Категория | Кол-во | Что реально есть |
| --- | ---: | --- |
| Публичные content routes | 4 | `/`, `/login`, `/register`, `/demo` |
| Learner content routes | 7 | `/profile`, `/learn`, `/practice`, `/tests/[id]`, `/analytics`, `/topics`, `/topics/[topicId]` |
| Admin content routes | 10 | `/admin`, `/admin/episodes`, `/admin/prompt-templates`, `/admin/predictions`, `/admin/tests`, `/admin/chat`, `/admin/data-quality`, `/admin/personalization`, `/admin/prediction-backtest`, `/admin/prediction-calibration` |
| Redirect/alias routes | 11 | `/chat`, `/dashboard`, `/insights`, `/progress`, `/subjects`, `/subjects/[subjectId]`, `/tests`, `/tests/create`, `/tests/stats`, `/collections/[id]`, `/admin/analytics` |
| Fallback | 1 | стандартная Next.js 404 |

Дополнительно внутри route-level экранов есть отдельные screen states, которые реально меняют пользовательское поведение:

- `/demo`: 8 сценарных scene states.
- `/profile`: 4 tab states.
- `/learn`: минимум 6 крупных states.
- `/tests/[id]`: состояние до submit и после submit.
- `/analytics`: пустое и заполненное состояние.
- `/topics/[topicId]`: валидный topic, пустая структура, invalid topic.

## 3. Что именно проверено

- Проверено по коду:
  - все route files в `src/app`;
  - access gate и redirect policy;
  - header/nav/status panel;
  - составные состояния `Profile`, `Learn`, `Practice`, `Topics`, `Tests`, admin dashboards;
  - alias routes и отсутствие custom forbidden/not-found pages.
- Проверено живьём:
  - public routes;
  - auth redirects;
  - переключение локали EN/RU;
  - registration, login, logout;
  - `/topics`, `/topics/[topicId]`;
  - `/learn` старт episode, precheck и переход в состояние `pending_materialization`;
  - `/practice` и переход в `/tests/[id]`;
  - `/tests/[id]` до и после submit;
  - `/profile` и его вкладки;
  - `/analytics`;
  - `/demo`;
  - `/admin`, `/admin/episodes`, `/admin/prompt-templates` и все admin metric routes по прямым URL;
  - alias redirects и default 404.
- Не полностью проверено живьём:
  - полный цикл `Learn` до финального `completed`;
  - `waiting_delay`;
  - destructive admin actions: сохранение prompt template, активация, применение calibration params;
  - сетевые failure-сценарии вне уже наблюдённых ошибок.

## 4. Какие пользовательские состояния существуют

### Гость

- Видит `/`, `/login`, `/register`, `/demo`.
- На публичных экранах в header есть только `Sign in` и `Create account`.
- Переход на любой защищённый route заканчивается редиректом на `/login`.
- Отдельной forbidden page нет.

### Новый авторизованный пользователь без topics

- После регистрации попадает на `/learn`.
- `Learn` фактически не может начаться без topic.
- `Practice` показывает подготовительный экран и пустое состояние с CTA в `Topics`.
- `Analytics` либо пуст, либо почти пуст.

### Авторизованный пользователь с topics, но без истории

- Может запускать `Learn` и `Practice`.
- Видит topic list и topic details.
- `Analytics` даёт mostly forecast/empty states, но не полноценную историю.

### Авторизованный пользователь с активным episode

- `/learn` может не показывать стартовую форму вообще.
- Экран восстанавливается автоматически из `?episode=...`, из local storage или из API последнего активного episode.
- Это скрытое поведение: пользователь не получает отдельного объяснения, почему route открылся не «с начала».

### Авторизованный пользователь с накопленной историей

- Получает заполненные `Profile/System`, `Analytics`, рекомендации и per-topic summary.
- Сейчас именно на этом уровне проявляются сильные межэкранные противоречия в цифрах.

### Admin

- Получает те же learner-навигационные кнопки плюс `Operator`.
- Видит admin overview.
- Может открыть расширенные admin dashboards, но большая их часть не связана через discoverable UI.

### Demo viewer

- Идёт по отдельному сценарию `/demo?scene=...`.
- Видит симулированный статус и demo navigation.
- Не использует реальные данные текущего пользователя.

## 5. Инвентаризация entry points

### Main navigation и глобальные элементы

- Public header:
  - `Sign in` -> `/login`
  - `Create account` -> `/register`
- Learner header:
  - `/profile`
  - `/learn`
  - `/practice`
  - `/analytics`
  - `/topics`
  - справа только имя/label пользователя и `Sign out`
- Admin header:
  - всё learner-навигационное выше;
  - дополнительная кнопка `/admin`
- Demo header:
  - surface navigation внутри `/demo`
  - simulated account вместо auth controls
- Locale switcher:
  - есть на обычном main-shell;
  - меняет язык интерфейса;
  - на `/demo` отсутствует.

### Status panel

- Появляется только на внутренних экранах и только на широком layout.
- На публичных страницах скрыт.
- Для learner показывает:
  - `Completed checks`
  - `Personalization`
  - `Expected accuracy`
  - одну кнопку `Learn`
- Для demo показывает simulated status и быстрые ссылки по demo.

### Чего в глобальной навигации нет

- нет footer;
- нет sidebar;
- нет profile dropdown/menu;
- нет dedicated logout page;
- нет отдельной help/discoverability зоны.

### Hidden / indirect entry points

- `/learn?subjectId=<id>`: deep link из `Topics` и скрытых переходов.
- `/learn?episode=<id>`: deep link из admin и внутреннего восстановления active episode.
- `/practice?subjectId=<id>&sectionId=<id>`: deep link из `Topics/[topicId]`.
- `/analytics?subjectId=<id>`: deep link из redirect aliases и internal filter persistence.
- `/demo?scene=<id>`: hidden demo deep link.

## 6. Общая карта экранов и переходов

```text
Гость
/ -> /login | /register | /learn -> /login
/login -> /learn
/register -> /learn
/demo -> /demo?scene=...

Learner base loop
/topics -> /topics/[topicId] -> /learn?subjectId=...
/learn -> active episode states -> /practice | /analytics
/practice -> /tests/[id] -> /learn | /analytics
/analytics -> /practice | /topics
/profile -> /learn | /practice | /analytics
header -> /profile | /learn | /practice | /analytics | /topics
sign out -> /login

Redirect aliases
/chat -> /learn
/dashboard -> /analytics
/insights -> /analytics
/progress -> /analytics
/subjects -> /topics
/subjects/[id] -> /topics/[id]
/tests -> /practice
/tests/create -> /practice
/tests/stats -> /analytics
/collections/[id] -> /topics

Admin
/admin -> /admin/prompt-templates | /admin/episodes | export links
/admin/episodes -> /learn?episode=...
/admin + direct URL -> /admin/predictions | /admin/tests | /admin/chat |
                       /admin/data-quality | /admin/personalization |
                       /admin/prediction-backtest | /admin/prediction-calibration

Тупики
guest + protected route -> /login
new learner on /learn without topics -> needs /topics first
invalid protected route as auth -> 404 or "Requested item was not found."
```

## 7. Полный каталог страниц

### 7.1 Публичные routes

### `/` — Home

- Доступ: гость и авторизованный пользователь.
- Как попасть: прямой вход по корню.
- Проверка: живьём и по коду.
- Что видит пользователь: hero-блок про EduAI, один главный CTA `Start episode`, рядом блок transparency items.
- Что можно сделать: нажать `Start episode`; перейти в `/login` и `/register` через header.
- К чему это приводит: CTA ведёт в `/learn`; для гостя это заканчивается редиректом на `/login`.
- От чего зависит поведение: от auth только верхний header и конечная точка CTA.
- Проблемы / пробелы / замечания: главный CTA публичного лендинга сразу бросает пользователя в защищённый flow; это создаёт auth-bounce вместо ясного onboarding step.

### `/login` — Sign in

- Доступ: гость и авторизованный пользователь.
- Как попасть: из header на публичных страницах; прямой URL; редирект после попытки открыть protected route гостем.
- Проверка: живьём и по коду.
- Что видит пользователь: форму `Email` + `Password`, submit, ссылку на `/register`, текст ошибки при неуспехе.
- Что можно сделать: войти; перейти на регистрацию.
- К чему это приводит: успешный login ведёт в `/learn`; неуспех показывает inline error.
- От чего зависит поведение: от валидности логина/пароля.
- Проблемы / пробелы / замечания: не возвращает пользователя на исходно запрошенный protected route; всегда отправляет в `/learn`.

### `/register` — Create account

- Доступ: гость и авторизованный пользователь.
- Как попасть: из public header, из `/login`, прямой URL.
- Проверка: живьём и по коду.
- Что видит пользователь: поля `Email`, `Password`, `Name (optional)`, checkbox research consent, submit, ссылка на `/login`.
- Что можно сделать: зарегистрироваться; включить/не включить research consent; перейти на вход.
- К чему это приводит: успешная регистрация ведёт в `/learn`.
- От чего зависит поведение: от валидности email/password и backend response.
- Проблемы / пробелы / замечания: после регистрации пользователь попадает в `Learn`, хотя для реального начала ему ещё нужен `Topic`; отдельного first-run onboarding нет.

### `/demo` — Demo workspace

- Доступ: гость и авторизованный пользователь.
- Как попасть: только по прямому URL `/demo`; из основной навигации route не обнаруживается.
- Проверка: живьём и по коду.
- Что видит пользователь: отдельный shell с demo navigation, simulated account, demo status panel, scripted content.
- Что можно сделать: переключать сцены, запускать autoplay, идти `Next`, `Restart`, прыгать сразу к analytics.
- К чему это приводит: меняется `?scene=` в URL и контент того же `/demo`.
- От чего зависит поведение: от query param `scene`.
- Проблемы / пробелы / замечания: route реальный, но скрытый; легко забыть о его существовании; это не продуктовый flow, а презентационный сценарий.

#### `/demo` — Scene inventory

- `profile-start`: стартовый профиль с declared preferences.
- `topics`: каноническая topic structure.
- `practice-baseline`: исходная практика с неудачными настройками.
- `learn`: guided learning scene.
- `montage`: fast-forward between episodes.
- `profile-updated`: updated system observations.
- `practice-adapted`: адаптированная практика.
- `analytics`: итоговая аналитика.

### 7.2 Learner routes

### `/profile` — общий контур

- Доступ: только авторизованный пользователь.
- Как попасть: через header; прямой URL.
- Проверка: живьём и по коду.
- Что видит пользователь: hero with CTA to `/learn`, `/practice`, `/analytics`; ниже tab strip.
- Что можно сделать: переключать вкладки; редактировать часть пользовательских данных; читать system observations.
- К чему это приводит: часть изменений сохраняется на backend, часть в cookie/browser preferences.
- От чего зависит поведение: от auth; от успешной загрузки `me`, `profile`, `preferences`, `predictions`, `research-consent`.
- Проблемы / пробелы / замечания: route объединяет сильно разные типы данных, а визуально distinction между editable declared preferences и read-only system observations легко теряется.

#### `/profile` — вкладка `Account`

- Что видит пользователь: editable display name, read-only account context, member since, attempts count, adaptive readiness, блок research consent and training eligibility.
- Что можно сделать: изменить display name; сохранить; дать consent; отозвать consent.
- К чему это приводит: `PATCH /api/users/me` и `PATCH /api/users/me/research-consent`.
- От чего зависит поведение: от текущего consent state и auth.
- Проблемы / пробелы / замечания: live audit показал противоречия в attempts count; у наполненного пользователя здесь отображалось `Structured attempts 0`, хотя история в системе есть.

#### `/profile` — вкладка `Accessibility`

- Что видит пользователь: группы переключателей `Theme`, `Font scale`, `High contrast`.
- Что можно сделать: менять theme/system/light/dark, размер шрифта и contrast.
- К чему это приводит: настройки применяются сразу и сохраняются в browser cookies/preferences.
- От чего зависит поведение: от браузерного состояния, не от backend.
- Проблемы / пробелы / замечания: отдельного подтверждения сохранения нет; поведение локальное, не серверное.

#### `/profile` — вкладка `Preferences`

- Что видит пользователь: declared pedagogy controls по `difficulty_target`, `depth`, `tone`, `explanation_style`, плюс отдельный read-only блок с сохранёнными declared values.
- Что можно сделать: менять declared preferences и сохранять.
- К чему это приводит: `PATCH /api/users/me/preferences`.
- От чего зависит поведение: от текущих declared preferences.
- Проблемы / пробелы / замечания: вкладка правильно отделяет declared preferences от system inference, но рядом на route есть и system tab, поэтому продуктово distinction всё равно требует явной коммуникации.

#### `/profile` — вкладка `System`

- Что видит пользователь: read-only inferred/effective observations с confidence bars, system summary, evidence quality, engagement signals, per-topic summary, notes and limitations.
- Что можно сделать: только читать и переходить в `/topics/[topicId]` из per-topic table.
- К чему это приводит: navigation only; состояние не редактируется.
- От чего зависит поведение: от наличия predictions, profile data, attempts history.
- Проблемы / пробелы / замечания: live audit показал сильное расхождение этого экрана с `StatusPanel` и `Topic details`; система местами знает, что история есть, а соседние экраны показывают ноль.

### `/learn` — общий контур

- Доступ: только авторизованный пользователь.
- Как попасть: header; home CTA; redirect from `/chat`; deep links из `Topics`; admin deep link `/learn?episode=...`.
- Проверка: старт, precheck и `pending_materialization` проверены живьём; `learning content`, `waiting_delay`, `completed` проверены по коду.
- Что видит пользователь: либо start screen для нового episode, либо восстановленный active episode.
- Что можно сделать: начать episode, проходить test steps, читать learning content, писать в scoped dialogue, продолжать sequence.
- К чему это приводит: создаётся и ведётся coordinated episode с precheck, learning step, postcheck и holdout.
- От чего зависит поведение: от `subjectId`, `episode`, local storage active episode, наличия topics/sections, runtime response, progress текущего episode.
- Проблемы / пробелы / замечания: route очень stateful и без явного onboarding; пользователь не получает прозрачного объяснения, почему он видит именно этот internal state.

#### `/learn` — состояние `старт / нет активного episode`

- Что видит пользователь: описание episode-first path, toggle `Adaptive` / `Standard baseline`, выбор topic, optional section, поле lesson focus, CTA `Start episode`.
- Что можно сделать: выбрать topic/section, ввести focus, запустить episode.
- К чему это приводит: долгий запрос на создание episode; после успеха route остаётся `/learn`, но получает active episode state и скрытый `?episode=...`.
- От чего зависит поведение: от наличия topics; от `?subjectId=...`.
- Проблемы / пробелы / замечания: для нового пользователя без topics экран почти тупиковый; есть CTA в `Topics`, но first-run flow не собран. Живьём старт episode иногда висел `Starting episode...` 20+ секунд без внятного прогресс-объяснения.

#### `/learn` — состояние `active test step`

- Что видит пользователь: active episode header, счётчики items/outcomes, progress tracker, блок текущего test step с radio-вариантами и answered counter.
- Что можно сделать: ответить на все вопросы; нажать `Submit step`.
- К чему это приводит: outcome записывается; дальше открывается submission summary и следующий state.
- От чего зависит поведение: от текущей sequence role (`precheck`, `postcheck`, `holdout`).
- Проблемы / пробелы / замечания: нет autosave; ошибки submit не были полноценно проиграны живьём; ожидание следующего шага может быть медленным.

#### `/learn` — состояние `pending_materialization`

- Что видит пользователь: подтверждение, что предыдущий step записан; CTA `Open next step`.
- Что можно сделать: открыть следующий step.
- К чему это приводит: вызов продолжения episode и materialization следующего шага.
- От чего зависит поведение: от успешного submit предыдущего шага.
- Проблемы / пробелы / замечания: это промежуточный экран без дополнительного объяснения причин задержки; логика понятна только после чтения интерфейса внимательно.

#### `/learn` — состояние `learning content / dialogue`

- Проверка: по коду; полное живое прохождение до этой точки в аудите не подтверждено.
- Что видит пользователь: title learning step, pedagogical context, guide/summary, section cards, reflection prompt, dialogue thread, starter prompts, textarea, счётчик remaining dialogue budget, source label `LLM` или fallback.
- Что можно сделать: отправлять scoped learner message; продолжить в следующий test.
- К чему это приводит: message идёт в episode dialogue route; `Continue to next test` продвигает sequence.
- От чего зависит поведение: от generation source, dialogue budget, текущего active learning session.
- Проблемы / пробелы / замечания: отдельного самостоятельного чата нет; диалог встроен только сюда. Это важно, потому что UI может создать ожидание отдельной chat-функции, которой route-wise не существует.

#### `/learn` — состояние `waiting_delay`

- Проверка: по коду.
- Что видит пользователь: сообщение, что delayed recheck ещё не наступил, и due timestamp.
- Что можно сделать: явного продуктивного действия на экране нет.
- К чему это приводит: фактически к ожиданию.
- От чего зависит поведение: от delayed holdout timing.
- Проблемы / пробелы / замечания: это реальный потенциальный тупик внутри route.

#### `/learn` — состояние `completed`

- Проверка: по коду.
- Что видит пользователь: completion banner, primary outcomes cards по sequence roles, CTA `Start another episode` и `Open analytics`.
- Что можно сделать: начать новый episode; перейти в analytics.
- К чему это приводит: сброс на новый episode flow или переход в `/analytics`.
- От чего зависит поведение: от полного завершения current episode.
- Проблемы / пробелы / замечания: до этого состояния ведёт длинная многошаговая логика; при slow runtime пользователь легко теряет ощущение целостности flow.

#### Наблюдение живьём по качеству содержания в `/learn`

- При topic name `Audit Algebra` precheck сгенерировался про финансовый аудит, а не про алгебру.
- Это не просто UX-шероховатость, а риск ложной продуктовой уверенности: пользователь запускает тему с одним смыслом, а получает контент про другой домен.

### `/practice` — Practice workspace

- Доступ: только авторизованный пользователь.
- Как попасть: header; CTA из `/analytics`; CTA из `/learn completed`; alias `/tests`; direct URL.
- Проверка: живьём и по коду.
- Что видит пользователь: два верхних path cards `Core` и `Custom`, блок recommended settings, ниже form `Build custom set`.
- Что можно сделать: перейти в canonical `Learn` через core CTA; собрать standalone set вручную.
- К чему это приводит: core CTA ведёт в `/learn`; custom form по submit генерирует test и переводит в `/tests/[id]`.
- От чего зависит поведение: от наличия topics, predictions, query params `subjectId` и `sectionId`.
- Проблемы / пробелы / замечания: route продуктово раздваивает meaning слова «practice»: верхний `Core` просто уводит в другой раздел, а нижний `Custom` даёт отдельный flow. Это повышает путаницу.

#### `/practice` — пустое состояние без topics

- Что видит пользователь: рекомендации с placeholders и отдельный блок, что сначала нужен topic.
- Что можно сделать: перейти в `/topics`.
- К чему это приводит: без topics custom set не стартует.
- От чего зависит поведение: от списка subjects.
- Проблемы / пробелы / замечания: новый пользователь после регистрации легко попадает в последовательность `Learn -> тупик -> Practice -> тупик -> Topics`.

#### `/practice` — заполненное состояние

- Что видит пользователь:
  - mode toggle `Personalized` / `Standard`;
  - select topic;
  - input practice focus;
  - optional subtopic select;
  - question count;
  - mode select `Practice / Quiz / Exam`;
  - CTA `Start practice set`;
  - recommended next difficulty, expected accuracy, expected time, confidence.
- Что можно сделать: собрать и запустить standalone set.
- К чему это приводит: POST на генерацию теста, затем push в `/tests/[id]`.
- От чего зависит поведение: от subjectId, sectionId, predictions, personalization mode.
- Проблемы / пробелы / замечания: живьём генерация часто зависала на `Generating...` 40–50 секунд; expected time иногда показывался даже при очень бедных данных; связь между `Practice` и тем, что будет/не будет учтено в learning updates, пользователь видит только позже в result state.

### `/tests/[id]` — Standalone test runner

- Доступ: только авторизованный пользователь и только владелец теста.
- Как попасть: из `/practice`; по прямому URL при знании ID.
- Проверка: живьём и по коду.
- Что видит пользователь до submit: custom-practice warning banner, title, question list, answered counter, submit button.
- Что можно сделать до submit: выбрать ответы; отправить test после ответа на все вопросы.
- К чему это приводит: submit отправляет answers и метрики времени; после этого экран перестраивается в result state.
- От чего зависит поведение: от существования теста у текущего пользователя.
- Проблемы / пробелы / замечания: явного client-side error state на failed submit почти нет; это не full episode flow, а отдельный island.

#### `/tests/[id]` — состояние после submit

- Что видит пользователь: score, `Prediction vs actual`, `Next suggestion`, by-tag stats, возможную пометку `Excluded from learning`, CTA в `/learn` и `/analytics`.
- Что можно сделать: перейти в `Learn` или `Analytics`.
- К чему это приводит: пользователь возвращается в основной learner loop.
- От чего зависит поведение: от метаданных ответа backend.
- Проблемы / пробелы / замечания: custom set может выглядеть как основной продуктовый path, но live audit показал явную пометку об исключении из learning updates при default/baseline collection.

### `/analytics` — Analytics overview

- Доступ: только авторизованный пользователь.
- Как попасть: header; CTA из `/profile`; CTA из `/tests/[id]`; alias `/dashboard`, `/insights`, `/progress`, `/tests/stats`.
- Проверка: живьём и по коду.
- Что видит пользователь: topic filter, forecast card, trend chart, mastery summary, difficulty status, consistency panel, `More views` card.
- Что можно сделать: менять текущий topic filter; перейти в `/practice` и `/topics` из блока `More views`; при пустой истории нажать `Start first episode`.
- К чему это приводит: меняется query `subjectId`, local storage и содержимое dashboard.
- От чего зависит поведение: от наличия topics, attempts, predictions, local storage saved topic.
- Проблемы / пробелы / замечания: блок `More views` явно read-only и не ведёт к отдельным deeper analytics screens; это скорее placeholder. Live audit показал противоречия между этим экраном и `Profile`/`Topic details`.

#### `/analytics` — пустое состояние

- Что видит пользователь: hero empty card с CTA `Start first episode`.
- Что можно сделать: перейти в `/learn`.
- К чему это приводит: пытается запустить learner loop.
- От чего зависит поведение: от отсутствия attempts.
- Проблемы / пробелы / замечания: если topics ещё не созданы, CTA ведёт в ещё один полу-тупиковый экран.

### `/topics` — Topics and topic groups

- Доступ: только авторизованный пользователь.
- Как попасть: header; CTA из `/practice`; alias `/subjects`; CTA из empty states.
- Проверка: живьём и по коду.
- Что видит пользователь: hero, note про topic groups, form `Create topic group`, form `Create topic`, tree/list topic groups and topics.
- Что можно сделать:
  - создать topic group;
  - создать topic;
  - открыть `/topics/[topicId]`;
  - `Start episode` для topic;
  - rename/delete group;
  - rename/archive topic.
- К чему это приводит: создаётся базовая контентная структура, без которой learner flows почти не работают.
- От чего зависит поведение: от текущих collections и subjects.
- Проблемы / пробелы / замечания: default `Unassigned` trap критичен. Новые topics легко остаются в `Unassigned`, а UI сам предупреждает, что такие темы не идут в analytics; live behaviour дополнительно показал исключение related learning updates для default/baseline collection.

#### `/topics` — список и действия внутри дерева

- Что видит пользователь: topic group cards; для default group нет rename/delete; внутри subject cards есть link, `Start episode`, `Rename`, `Archive`.
- Что можно сделать: прямой переход в topic detail и straight jump в `Learn`.
- К чему это приводит: либо в `/topics/[id]`, либо в `/learn?subjectId=<id>`.
- От чего зависит поведение: от того, assigned ли topic к collection или остаётся unassigned.
- Проблемы / пробелы / замечания: rename/archive/delete используют native `prompt` и `confirm`; ошибки этих действий почти не выражены UI-слоем и могут пройти как silent failure.

### `/topics/[topicId]` — Topic detail

- Доступ: только авторизованный пользователь.
- Как попасть: из `/topics`; deep link; alias `/subjects/[subjectId]`; ссылки из profile system table.
- Проверка: живьём и по коду.
- Что видит пользователь: title, description, possible exclusion note, CTA `Start episode`, `Back to topics`, cards totals/recent attempts/recommended episode, блок structure.
- Что можно сделать:
  - запустить episode для topic;
  - вернуться к списку topics;
  - стартовать recommended episode;
  - создать subtopic;
  - для subtopic: `Practice this subtopic`, move up/down, rename, delete.
- К чему это приводит:
  - `Start episode` и recommended episode ведут в `/learn?subjectId=<id>`;
  - `Practice this subtopic` ведёт в `/practice?subjectId=<id>&sectionId=<id>`;
  - structure actions меняют topic tree.
- От чего зависит поведение: от валидности topicId, наличия sections, stats, recommendation response.
- Проблемы / пробелы / замечания: live audit выявил тяжёлую несогласованность данных. На заполненном пользователе topic detail мог показывать `Total tests 0` и `No attempts yet`, пока `Analytics` и `Profile/System` показывали evidence.

#### `/topics/[topicId]` — пустая структура

- Что видит пользователь: form add subtopic и empty state `Add subtopic`.
- Что можно сделать: создать первый subtopic.
- К чему это приводит: появляется nested structure и deep link в `Practice`.
- От чего зависит поведение: от текущего списка sections.
- Проблемы / пробелы / замечания: рекомендованный episode не переносит section choice, только subject; связь между topic-level recommendation и subtopic structure неполная.

#### `/topics/[topicId]` — invalid topic

- Проверка: живьём.
- Что видит пользователь: сначала долгий `Loading topic...`, потом `Requested item was not found.`
- Что можно сделать: только уйти навигацией браузера или header.
- К чему это приводит: фактически в тупик.
- От чего зависит поведение: от topicId.
- Проблемы / пробелы / замечания: invalid state определяется с заметной задержкой и визуально похож на бесконечную загрузку.

### 7.3 Admin routes

### `/admin` — Operator overview

- Доступ: только admin.
- Как попасть: кнопка `Operator` в header; прямой URL.
- Проверка: живьём и по коду.
- Что видит пользователь: operational snapshot, readiness, runtime backend, artifact slot, consent/training eligibility, export links, recent dangerous actions.
- Что можно сделать: открыть dataset export, evaluation export, `/admin/prompt-templates`, `/admin/episodes`.
- К чему это приводит: либо raw export path, либо переход на две связанные admin pages.
- От чего зависит поведение: от admin role и ответов `operational-summary`/`audit-events`.
- Проблемы / пробелы / замечания: остальные admin dashboards отсюда не discoverable; overview создаёт впечатление, что admin-система ограничена только prompt templates и episodes.

### `/admin/episodes` — Episode Control Surface

- Доступ: только admin.
- Как попасть: из `/admin`; прямой URL.
- Проверка: живьём и по коду.
- Что видит пользователь: form launch episode, reload control, recent operator episodes, episode inspection, quick subject control, quick topic collection control.
- Что можно сделать: запускать episode, создавать subject/section, выбирать episode для inspection, открыть текущий episode в learner flow.
- К чему это приводит: прямое управление операторским контуром и deep link в `/learn?episode=...`.
- От чего зависит поведение: от наличия topics/sections/episodes.
- Проблемы / пробелы / замечания: это сильный operator path, но он не встроен в learner narrative; без знания route продуктовый владелец может не обнаружить его.

### `/admin/prompt-templates` — Prompt templates

- Доступ: только admin.
- Как попасть: из `/admin`; прямой URL.
- Проверка: route и загрузка списков проверены живьём; destructive actions не проиграны.
- Что видит пользователь: список keys, список versions, editor `Content`, editor `Notes`, кнопки `Save`, `Duplicate as new version`, `Activate`.
- Что можно сделать: редактировать template, создавать новую версию, активировать версию.
- К чему это приводит: влияет на будущие генерации.
- От чего зависит поведение: от выбранного key/version и backend response.
- Проблемы / пробелы / замечания: страница реально рабочая и потенциально опасная, но это почти не отражено в общей навигационной архитектуре.

### Admin metric dashboards — краткий каталог

| Route | Доступ | Как попасть | Что видит пользователь | Что можно сделать | Проблемы / замечания |
| --- | --- | --- | --- | --- | --- |
| `/admin/predictions` | только admin | прямой URL | фильтры `Window / Policy mode / Subject / Include excluded`, таблицы и bar lists по accuracy/duration calibration | менять фильтры | route не связан из overview; purely dashboard, без пояснений для non-operator пользователя |
| `/admin/tests` | только admin | прямой URL | тестовые метрики: generated per day, completion, avg score by difficulty, prediction error trend, scatter sample | менять фильтры | discoverability почти нулевая |
| `/admin/chat` | только admin | прямой URL | chat events per day, avg assistant length by style, personalization mode usage, latency distribution | менять фильтры | standalone learner chat route при этом отсутствует; admin-метрики чата существуют отдельно от пользовательского route |
| `/admin/data-quality` | только admin | прямой URL | counts total/eligible/excluded, excluded reasons, tagging source, compliance, retry, warnings | менять фильтры | полезный экран есть, но не встроен в admin IA |
| `/admin/personalization` | только admin | прямой URL | A/B usage share, tone/style trends, confidence distribution, difficulty transitions, exploration trend | менять фильтры | нет discoverable ссылок из overview |
| `/admin/prediction-backtest` | только admin | прямой URL | отдельная форма filters, `Run backtest`, execution stats, policy summary, calibration tables, by-difficulty tables | запускать backtest с параметрами | route выглядит рабочим, но это ручной URL-only инструмент |
| `/admin/prediction-calibration` | только admin | прямой URL | filters including `Grid size` и `Apply recommended params`, `Run calibration`, execution, insufficient-data or comparison tables | запускать calibration; потенциально применять params | самый чувствительный direct-entry route; без отдельной навигации и без дополнительного guard-объяснения |

### `/admin/analytics` — legacy alias

- Доступ: только admin.
- Как попасть: прямой URL.
- Проверка: живьём и по коду.
- Что происходит: route мгновенно редиректит на `/admin`.
- Проблемы / пробелы / замечания: собственного экрана нет.

### 7.4 Redirect / alias routes

Эти маршруты существуют как реальные entry points, но собственного UI не имеют.

| Route | Кто может открыть | Фактическое поведение | Примечание |
| --- | --- | --- | --- |
| `/chat` | гость / auth | гость -> `/login`, auth -> `/learn` | отдельного chat route нет |
| `/dashboard` | гость / auth | гость -> `/login`, auth -> `/analytics` | legacy alias |
| `/insights` | гость / auth | гость -> `/login`, auth -> `/analytics` | legacy alias |
| `/progress` | гость / auth | гость -> `/login`, auth -> `/analytics` | legacy alias |
| `/subjects` | гость / auth | гость -> `/login`, auth -> `/topics` | legacy alias |
| `/subjects/[subjectId]` | гость / auth | гость -> `/login`, auth -> `/topics/[subjectId]` | deep alias |
| `/tests` | гость / auth | гость -> `/login`, auth -> `/practice` | route name misleading: не список tests, а redirect |
| `/tests/create` | гость / auth | гость -> `/login`, auth -> `/practice` с пробросом `subjectId/sectionId` | технический alias |
| `/tests/stats` | гость / auth | гость -> `/login`, auth -> `/analytics` | stats route не самостоятельный |
| `/collections/[id]` | гость / auth | гость -> `/login`, auth -> `/topics` | collection detail route фактически отсутствует |
| `/admin/analytics` | admin | `/admin` | отдельного analytics page в admin нет |

### 7.5 Fallback, not-found, forbidden, redirect-only states

### Default 404

- Проверка: живьём.
- Для гостя на произвольном несуществующем public route показывается стандартная Next.js 404.
- Для авторизованного пользователя на несуществующем защищённом route внутри shell остаётся not-found поведение.
- Custom branded 404 route не найден.

### Forbidden state

- Dedicated forbidden page нет.
- Не-admin при входе в `/admin*` уводится в `/learn`.
- Гость при входе в protected route уводится в `/login`.
- На короткий момент доступен только промежуточный access-check panel.

## 8. Основные пользовательские сценарии end-to-end

### Сценарий 1. Первый вход нового пользователя

1. Гость открывает `/`.
2. Переходит в `/register`.
3. После регистрации автоматически попадает в `/learn`.
4. На `/learn` видит, что сначала нужен topic.
5. Переходит в `/topics`.
6. Создаёт topic group опционально и topic.
7. Возвращается в `/learn` или запускает episode прямо из `Topics`.

Итог: сценарий работает, но собран не в один цельный onboarding loop. После регистрации продукт не ведёт пользователя по следующему обязательному шагу явно.

### Сценарий 2. Запуск учебного episode

1. Пользователь открывает `/learn`.
2. Выбирает mode `Adaptive` или `Standard baseline`, topic, optional section, lesson focus.
3. Нажимает `Start episode`.
4. Долго ждёт `Starting episode...`.
5. Получает `Precheck`.
6. Отвечает и отправляет step.
7. Получает summary и промежуточный экран `Open next step`.
8. Дальше должен попасть в learning content, потом в postcheck и holdout.

Итог: базовый flow реальный, но медленный и слабо объясняющий промежуточные состояния.

### Сценарий 3. Standalone practice set

1. Пользователь открывает `/practice`.
2. Либо уходит в canonical `Learn`, либо собирает custom set.
3. Выбирает topic, optional subtopic, focus, question count, mode, personalization mode.
4. Нажимает `Start practice set`.
5. Долго ждёт `Generating...`.
6. Попадает в `/tests/[id]`.
7. Решает тест и отправляет.
8. Получает result summary и ссылки обратно в основной loop.

Итог: сценарий рабочий, но продуктово двусмысленный. Это выглядит как основной путь, хотя часть таких попыток исключается из learning updates.

### Сценарий 4. Управление topics и subtopics

1. Пользователь открывает `/topics`.
2. Создаёт group и topic.
3. Открывает `/topics/[topicId]`.
4. Создаёт subtopic.
5. Запускает `Practice this subtopic` или `Start episode`.

Итог: контур работает, но логика `Unassigned` слишком легко ломает связность с analytics и learning eligibility.

### Сценарий 5. Просмотр аналитики

1. Пользователь открывает `/analytics`.
2. Выбирает topic filter.
3. Смотрит forecast, trend, mastery, consistency.
4. Может перейти только в `/practice` или `/topics`.

Итог: это обзорный dashboard, а не отдельная аналитическая навигационная ветка.

### Сценарий 6. Работа с профилем

1. Пользователь открывает `/profile`.
2. Меняет display name.
3. Меняет accessibility settings.
4. Меняет declared preferences.
5. Читает system tab.
6. Может дать или отозвать research consent.

Итог: route функциональный, но продуктово перегружен разными типами данных и сейчас страдает от inconsistent counters.

### Сценарий 7. Admin monitoring и operator control

1. Admin открывает `/admin`.
2. Переходит в `/admin/episodes` или `/admin/prompt-templates`.
3. Остальные dashboards открывает по прямому URL.
4. Может открыть learner episode через `/learn?episode=...`.

Итог: admin features реальные, но информационная архитектура admin-контура незавершённая.

### Сценарий 8. Demo walkthrough

1. Пользователь открывает `/demo`.
2. Листает scripted scenes вручную или autoplay.
3. Смотрит profile/topics/practice/learn/analytics как презентационный маршрут.

Итог: useful showcase, но route скрыт и не встроен в продуктовый контур.

## 9. Недостижимые, слабосвязанные и декоративные элементы

- `/chat` существует только как redirect; отдельного chat-screen нет.
- `/tests` и `/tests/create` звучат как самостоятельные pages, но реально редиректят в `/practice`.
- `/collections/[id]` формально существует, но никакого collection detail screen не даёт.
- `/admin/predictions`, `/admin/tests`, `/admin/chat`, `/admin/data-quality`, `/admin/personalization`, `/admin/prediction-backtest`, `/admin/prediction-calibration` реальны, но фактически «спрятаны» от normal navigation.
- Блок `More views` на `/analytics` выглядит как начало отдельной аналитической ветки, но сейчас это декоративный read-only placeholder.
- `StatusPanel` существует как глобальный индикатор, но даёт только один CTA в `/learn`; продуктовая ценность панели пока ограничена.
- `/demo` функционален, но не встроен в общий сценарий и не discoverable из обычного UI.

## 10. Тупики, UX-разрывы и неочевидности

- После регистрации пользователь попадает в `/learn`, но не может осмысленно стартовать без topic. Следующий обязательный шаг не orchestrated.
- `Unassigned` / default collection — критическая ловушка. Topic можно легко создать без нормальной group, после чего данные выглядят «реальными», но не попадают туда, куда пользователь ожидает.
- Долгие состояния `Starting episode...` и `Generating...` не дают понятного progress explanation. Пользователь видит, что система «думает», но не понимает сколько ждать и что происходит.
- `/learn` может внезапно открыться в восстановленном active episode вместо стартовой формы. Это удобно технически, но непрозрачно пользовательски.
- Invalid `/topics/[id]` сначала выглядит как затянувшаяся загрузка, а не как понятный not-found.
- Login не возвращает на исходно запрошенный protected route; всегда уводит в `/learn`.
- Часть actions внутри `Topics` и `Topic details` завязана на native `prompt`/`confirm`, а не на нормальные UI controls; ошибки при этом почти не коммуницируются.
- Межэкранные счётчики данных сейчас небезопасны для продуктовых выводов: один экран говорит «данных нет», другой одновременно строит аналитику.

## 11. Что сейчас реально доступно пользователю как продукт, а что ещё нет

### Реально доступно

- Регистрация, login, logout.
- Создание topics и topic groups.
- Создание subtopics внутри topic.
- Запуск structured `Learn` episode минимум до precheck и продолжения sequence.
- Запуск standalone `Practice` set и прохождение `/tests/[id]`.
- Просмотр обзорной аналитики по topic.
- Настройка declared preferences, accessibility и research consent.
- Просмотр system/inference summary.
- Admin monitoring и operator surfaces.
- Demo showcase route.

### Частично доступно или доступно, но не как цельный продуктовый контур

- Полный end-to-end `Learn` до финального completion state не был полностью подтверждён живьём в рамках аудита из-за длительных runtime transitions.
- Chat существует не как отдельный продуктовый раздел, а только как внутренний step внутри `Learn`.
- Deep analytics navigation за пределами overview нет.
- Admin information architecture неполная: многие экраны реальны, но не discoverable.
- First-run onboarding отсутствует как связный сценарий.

### Пока не выглядит продуктово завершённым

- Связность между `Register` -> `Topics` -> `Learn`.
- Единое и правдивое отображение user data across screens.
- Прозрачное объяснение, что именно считается learning evidence, а что исключается.
- Надёжная discoverability hidden routes и legacy aliases.

## 12. Приоритетный список проблем связности интерфейса

1. Межэкранная несогласованность данных. На заполненном пользователе `Analytics` и `Profile/System` показывают evidence, а `StatusPanel`, `Profile/Account` и `Topic details` могут одновременно показывать нули.
2. Ловушка `Unassigned` / default collection. Topic легко создать в состоянии, которое позже ломает аналитику и observed learning inclusion.
3. Медленные и непрозрачные runtime-переходы в `Learn` и `Practice`. Состояния ожидания не объясняют прогресс и создают ощущение подвисания.
4. Разорванный first-run path. После регистрации пользователь не ведётся к обязательному шагу создания topic и легко попадает в серию полутупиков.
5. Сильная недообнаруживаемость доступных экранов. Это касается скрытого `/demo`, manual-only admin dashboards, alias routes без собственного экрана и отсутствия явного standalone chat route.
6. Продуктовая двусмысленность `Practice` против `Learn`. В интерфейсе оба выглядят как основные entry points, хотя смысл и последствия для данных разные.
7. Content grounding риск в `Learn`. Название topic может увести генерацию не в тот домен, что критично для доверия к системе.
8. Invalid and edge states оформлены слабо. Нет branded forbidden page, invalid topic долго выглядит как loading, часть actions может fail silently.

## 13. Итоговая честная оценка текущего пользовательского продукта

С точки зрения владельца продукта сейчас у EduAI есть реальный, но ещё не собранный до конца learner-контур. Пользователь действительно может зарегистрироваться, создать topic, пройти structured or standalone assessment flow, увидеть часть аналитики и настроить профиль. Но продукт пока не обеспечивает цельное ощущение «следующего шага» и местами противоречит сам себе данными и discoverability.

Самая важная практическая правда после аудита такая: текущий интерфейс не пустой и не декоративный, но он ещё не ведёт пользователя по одной прозрачной линии. В нём уже есть рабочие куски, однако связки между ними пока слабее, чем отдельные экраны сами по себе.
