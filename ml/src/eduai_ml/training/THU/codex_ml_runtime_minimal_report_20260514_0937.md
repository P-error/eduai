# Minimal ML runtime check

## Итог

APPLY SMOKE WORKS

## Что проверено

Локально прогнан ближайший app integration path через существующие TS-модули `ml-six-factor-shadow` и `ml-six-factor-apply` с THU artifact. Runtime/API/UI не менялись, production/current artifact не трогался, полный test suite не запускался.

## Результат shadow

- decisionSource: `ml_policy`
- fallbackUsed: `false`
- selected_config: `difficulty=medium`, `depth=detailed`, `support_level=guided`, `presentation_format=step_by_step`, `examples_level=single`, `terminology_level=balanced`
- artifact version: `linear_candidate_scorer_v1_seed_42`
- learner-facing behavior changed: no (`appliedToLearnerFacingOutput=false`, `EDUAI_SIX_FACTOR_APPLY` не был включён)

## Результат apply smoke

- done/skipped/failed: done
- причина: локальный smoke безопасен, потому что запускал только pure TS modules через temp compile under `ml/.codex_tmp`, без dev/prod server и без записи runtime state
- selected_config reached generation: yes
- appliedPath: `learning_content`
- appliedPromptInstructionCount: 6

## Что изменено

- Добавлен отчёт: `ml/src/eduai_ml/training/THU/codex_ml_runtime_minimal_report_20260514_0937.md`
- Код, UI, API routes, runtime config и production/current artifact не изменялись.
- Временная компиляция `ml/.codex_tmp/thu-minimal-runtime-check` удалена после smoke.

## Следующий шаг

Сделать один dev/staging episode через настоящий app route с теми же shadow flags и проверить сохранённый `sixFactorShadow` в metadata.

## Delivery

Phone delivery: failed. Reason: Taildrop to `100.88.154.9` failed because the peer is offline.
