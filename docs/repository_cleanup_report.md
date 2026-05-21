# Repository Cleanup Report

Historical cleanup report from 2026-05-07. Its Codex report location conclusion is superseded by the 2026-05-18 policy: new Codex/task reports go to `codex-report/`; `reports/codex/` is legacy/archive only.

## Что найдено

- Активный Next.js runtime находится в `src/`.
- Активные API routes находятся в `src/app/api/**/route.ts`.
- Активный Prisma слой находится в `prisma/`.
- Активный policy config находится в `configs/active_policy.json`.
- ML source, schemas, contracts, examples, scripts и tests находятся в `ml/`.
- Runtime artifact slot находится в `artifacts/runtime/eduai_native_pedagogy/current/`.
- В корне лежали старые audit/tree snapshots, review/source snapshot packages, generated outputs, `test-results` и root Python cache.
- В `reports/` лежали Codex reports без подкаталога.
- В `codex-report/` лежали legacy Codex reports и одна audit note.

## Что перемещено

- `reports/codex_report_20260507_1539.md` -> `reports/codex/`
- `reports/codex_report_20260507_1640.md` -> `reports/codex/`
- `reports/codex_report_20260507_1654.md` -> `reports/codex/`
- `codex-report/codex_report_*.md` -> `reports/codex/`
- `codex-report/pass4_prechange_audit_notes.md` -> `reports/audits/pass4_prechange_audit_notes.md`
- `repo_audit_index.md` -> `reports/audits/repo_audit_index.md`
- `repo_tree_clean.txt` -> `reports/archive/repo_tree_clean.txt`
- `repo_structure_snapshot/` -> `reports/archive/repo_structure_snapshot/`
- `eduai_repo_structure_snapshot_20260403_1130.zip` -> `eduai-clean/archive/`
- `audit_review_package/` -> `eduai-clean/archive/audit_review_package/`
- `review_pack/` -> `eduai-clean/archive/review_pack/`
- `outputs/` -> `eduai-clean/archive/outputs/`
- `test-results/` -> `eduai-clean/archive/test-results_20260507/`
- `__pycache__/` -> `eduai-clean/archive/root_pycache_20260507/`

## Что оставлено на месте из-за риска

- `src/**` - активный код приложения и routes.
- `prisma/**` - schema и миграции.
- `configs/**` - active runtime config.
- `ml/examples/**` - generated, но canonical examples для contracts/tests/validation.
- `ml/src/**`, `ml/scripts/**`, `ml/tests/**` - активный ML-layer.
- `bootstrap_training/**` - содержит исполняемые training scripts и lane-specific generated data.
- `training_datasets/**` - generated dataset snapshots, documented как export location.
- `artifacts/runtime/**` - путь читает runtime-код.
- `codex-report/.gitkeep` - legacy placeholder оставлен, сами отчёты перенесены в `reports/codex/`.
- `.logs/` - output path используется `npm run dev:log`.

## Обновлённая организация на момент cleanup

- На 2026-05-07 cleanup action направлял Codex reports в `reports/codex/`; это правило superseded 2026-05-18.
- Audits и review notes должны идти в `reports/audits/`.
- Old one-off snapshots должны идти в `reports/archive/`.
- Bulky local review/source packs должны идти в `eduai-clean/archive/`.

## Оставшиеся проблемы

- Оценка `codex-report/` как legacy placeholder устарела; текущая policy 2026-05-18 считает `codex-report/` canonical current path для новых Codex/task reports.
- В рабочем дереве много незакоммиченных runtime/source изменений, не связанных с этой cleanup-задачей.
- `eslint.config.mjs` всё ещё содержит ignore-паттерны для старых root archive paths; они не ломают build, но могут быть упрощены отдельной config-only задачей.
- `training_datasets` и `bootstrap_training` содержат generated data рядом с training scripts; это осознанно оставлено для reproducibility и требует отдельной data retention политики.
- В `artifacts/ui-audit-20260402/` много UI audit screenshots; они оставлены из-за audit provenance.

## Исходный код и логика

- В рамках cleanup исходный код приложения не изменялся.
- Runtime-логика приложения не изменялась.
- UI, API routes, Prisma schema, `configs/active_policy.json` и ML-логика не изменялись.

## Six-Factor Shadow Safety Check 2026-05-07

- Проверены `src/app/api/chat/route.ts`, `src/lib/test-generation.ts`, `src/lib/learning-content-generation.ts` и `src/lib/ml-six-factor-*.ts`.
- При выключенном `EDUAI_SIX_FACTOR_SHADOW` helper `buildOptionalSixFactorShadowMetadata(...)` возвращает `null`.
- В production metadata используется conditional spread `...(sixFactorShadow ? { sixFactorShadow } : {})`, поэтому metadata не добавляется при выключенном flag.
- Six-factor render instructions не передаются в learner-facing prompt/content path.
- Technical test `response_format` остаётся `mcq`.
- В текущем dirty diff есть более широкие изменения `src/app/api/chat/route.ts`, не относящиеся к этой cleanup-задаче; они не исправлялись и не расширялись здесь.
