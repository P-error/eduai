# Real app route ML shadow check

## Итог
APPLY ROUTE WORKS

## Shadow route result
- route/path: `POST /api/chat` via `src/app/api/chat/route.ts`
- sixFactorShadow present: yes
- decisionSource: `ml_policy`
- fallbackUsed: `false`
- selected_config: `difficulty=medium`, `depth=detailed`, `support_level=guided`, `presentation_format=step_by_step`, `examples_level=multiple`, `terminology_level=balanced`
- artifact version: `linear_candidate_scorer_v1_seed_42`
- appliedToLearnerFacingOutput: `false`
- learner-facing prompt changed: no

## Apply route result
- done/skipped/failed: done
- selected_config reached generation: yes
- appliedPromptInstructionCount: 6
- learner-facing prompt actually changed: yes
- decisionSource: `ml_policy`
- fallbackUsed: `false`

## Что изменено
- Добавлен этот отчёт: `ml/src/eduai_ml/training/THU/codex_real_app_route_shadow_report_20260514_0947.md`
- Код, UI, API routes, runtime config и production/current artifact не изменялись.
- Для smoke использовались dev DB, локальный mock OpenAI-compatible endpoint и настоящий route handler `POST /api/chat`; созданные smoke user/subject/chat/evaluation episode records были удалены после проверки.

## Следующий шаг
Запустить тот же `POST /api/chat` route в staging с shadow flags и без `EDUAI_SIX_FACTOR_APPLY`, оставив запись для ручной проверки metadata.

## Delivery
Phone delivery: failed. Reason: Taildrop to `100.88.154.9` failed because the peer is offline.
