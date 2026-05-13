# PASS4 pre-change audit notes

- `/topics` открывается стабильно; пустое состояние и CTA уже есть. Риск для PASS4: не менять owner-path запуск эпизода и topic/group API payloads.
- `/topics/[topicId]` открывается стабильно, но detail page заметно выбивается из общей UI-системы: верхние карточки, totals, recent attempts, recommendation и structure используют много raw slate-классов; loading/error состояния не дают явного следующего шага.
- `/learn` открывается без no-topic regression для learner с темой; no-topic state уже ведёт в Topics. Риск: не менять episode creation/continue/submit flow.
- `/practice` основной CTA понятен, но `/tests/[id]` и evidence summary всё ещё показывают на первом уровне research/runtime wording: `Контракт результата`, `Прогноз против факта`, `Статистика по тегам`, `Учебные обновления`.
- Evidence summary не объясняет простым языком, что именно записано и почему Practice не заменяет полный учебный эпизод; технические детали видны слишком рано.
- `/analytics` открывается стабильно на `/analytics`, URL loop не воспроизведён. Риск: не трогать Analytics URL policy.
- `/profile` открывается, четыре основные секции видны. Нижние раскрываемые детали `Персонализация`, `Учебная история по темам`, `Заметки и ограничения` плотные, raw table styling менее читабелен, но данные скрывать нельзя.
- `/demo` открывается, Suspense/AuthGate build fix не требует изменений. Риск: не менять demo layout/AuthGate boundary.
