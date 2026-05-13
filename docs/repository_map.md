# Repository Map

Карта отражает фактическую структуру репозитория на 2026-05-07 после безопасной организационной очистки.

## Основные зоны

- `src/` - исходный код Next.js приложения: App Router, API routes, UI components, shared runtime libraries.
- `src/app/api/**/route.ts` - серверные API routes. Не перемещать без проверки маршрутов, импортов и build.
- `src/lib/` - прикладная runtime-логика, auth, prediction, dataset export, learner flow, LLM provider.
- `src/lib/llm/provider.ts` - единая точка LLM-вызовов.
- `configs/` - активные runtime-конфиги приложения. `configs/active_policy.json` нельзя перемещать или менять без отдельной задачи.
- `prisma/` - Prisma schema и миграции. Не перемещать без явной migration-задачи.
- `public/` - статические ассеты Next.js.
- `scripts/` - shell self-check scripts, вызываемые из `package.json`.
- `ml/` - исследовательский ML-layer: контракты, схемы, examples, Python source, scripts и tests.
- `bootstrap_training/` - bootstrap/offline training lanes. Это не Next.js runtime, но содержит исполняемые Python scripts и локальные данные.
- `training_datasets/` - export snapshots для training/evaluation. Подкаталоги generated и по умолчанию не должны коммититься.
- `artifacts/runtime/eduai_native_pedagogy/current/` - runtime slot для будущего ML artifact. Код читает этот путь, поэтому не перемещать.
- `docs/` - актуальная документация проекта. `docs/RESEARCH_SPEC.md` является основным research-facing документом.
- `reports/` - структурированные отчёты, аудиты и архивные организационные материалы.
- `eduai-clean/` - локальные архивы, review packs и staging bundles; содержимое игнорируется Git.

## Reports

- `reports/codex/` - отчёты Codex по задачам, включая legacy `codex_report_*.md`, перенесённые из `codex-report/`.
- `reports/audits/` - аудиты и ревью состояния репозитория.
- `reports/archive/` - старые одноразовые отчёты, tree snapshots и исторические report snapshots.
- `codex-report/` - legacy placeholder. После cleanup active report location: `reports/codex/`.

## Generated Artifacts

- `training_datasets/<phase>/<snapshot_id>/` - generated dataset exports; нужны для воспроизводимости, но не должны попадать в root.
- `artifacts/runtime/eduai_native_pedagogy/current/files/` - generated runtime artifact files; связаны с artifact slot.
- `bootstrap_training/*/data/` - generated/raw/interim/processed training lane data.
- `eduai-clean/archive/` - локальные архивные пакеты и старые source snapshots, не являющиеся активным source tree.

## Нельзя трогать без проверки

- `src/**`
- `prisma/**`
- `configs/**`
- `ml/src/**`
- `ml/scripts/**`
- `ml/tests/**`
- `ml/examples/**`
- `bootstrap_training/**`
- `training_datasets/**`
- `artifacts/runtime/**`
- `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`

Перед перемещением любого файла из этих зон нужно проверить imports, package scripts, tests, validation scripts и документацию.

## Shadow Adapter Safety Note

Six-factor app-side source files находятся в `src/lib/ml-six-factor-*.ts`.
Они являются source code и не относятся к reports/artifacts cleanup.
Не перемещать их без проверки TypeScript imports, `npm run build` и shadow self-check.
