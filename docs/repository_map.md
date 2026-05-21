# Repository Map

Карта отражает фактическую структуру репозитория после обновления документации под текущий исполняемый контур и policy update 2026-05-18.

## Основные зоны

- `src/` - исходный код Next.js приложения: App Router, API routes, UI components, shared runtime libraries.
- `src/app/api/**/route.ts` - серверные API routes. Не перемещать без проверки маршрутов, импортов и build.
- `src/lib/` - прикладная runtime-логика, auth, prediction, dataset export, learner flow, LLM provider.
- `src/lib/llm/provider.ts` - единая точка LLM-вызовов.
- `src/lib/ml-six-factor-*.ts` - текущий six-factor pedagogical runtime: contract, loader, candidate generator, adapter, apply, shadow, delivered-config metadata.
- `configs/` - активные runtime-конфиги приложения. `configs/active_policy.json` нельзя перемещать или менять без отдельной задачи.
- `configs/ml_accuracy_logreg_artifact.dev.json` - tracked synthetic/dev accuracy artifact for runtime wiring and demo diagnostics; not production evidence.
- `prisma/` - Prisma schema и миграции. Не перемещать без явной migration-задачи.
- `public/` - статические ассеты Next.js.
- `scripts/` - shell self-check scripts, вызываемые из `package.json`.
- `ml/` - исследовательский ML-layer: контракты, схемы, examples, Python source, scripts и tests.
- `bootstrap_training/` - bootstrap/offline training lanes. Это не Next.js runtime, но содержит исполняемые Python scripts и локальные данные.
- `training_datasets/` - export snapshots для training/evaluation. Подкаталоги generated и по умолчанию не должны коммититься.
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/` - tracked current THU six-factor scorer artifact used by the default six-factor artifact loader path.
- `artifacts/runtime/eduai_native_pedagogy/current/` - future/current-slot metadata area kept for artifact-slot conventions; do not treat it as the current default scorer path unless code is changed to read it.
- `docs/` - актуальная документация проекта. `docs/RESEARCH_SPEC.md` является основным research-facing документом.
- `reports/` - структурированные отчёты, аудиты и архивные организационные материалы.
- `eduai-clean/` - локальные архивы, review packs и staging bundles; содержимое игнорируется Git.

## Reports

- `codex-report/` - canonical current location для новых Codex/task reports.
- `reports/codex/` - legacy/archive location для старых Codex reports, включая ранее перенесённые `codex_report_*.md`; не использовать для новых отчётов.
- `reports/audits/` - аудиты и ревью состояния репозитория.
- `reports/archive/` - старые одноразовые отчёты, tree snapshots и исторические report snapshots.
- Один и тот же Codex/task report не должен дублироваться в `codex-report/` и `reports/codex/`.

## Generated and tracked artifacts

- `training_datasets/<phase>/<snapshot_id>/` - generated dataset exports; нужны для воспроизводимости, но не должны попадать в root.
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json` - tracked six-factor scorer artifact. Current provenance is synthetic/bootstrap, so it verifies runtime integration rather than real-user learning effect.
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/runtime_manifest.json` - tracked runtime manifest for the THU scorer.
- `artifacts/runtime/eduai_native_pedagogy/current/README.md` and `slot_metadata.json` - tracked slot metadata, not the current default scorer implementation path.
- `configs/ml_accuracy_logreg_artifact.dev.json` - tracked DEV accuracy artifact.
- `configs/*.local.json` - ignored local runtime artifacts.
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

## Six-factor runtime safety note

Six-factor app-side source files находятся в `src/lib/ml-six-factor-*.ts`.
Они являются source code и не относятся к reports/artifacts cleanup.
Не перемещать их без проверки TypeScript imports, `npm run build` и `npm run ml-six-factor:self-check`.

Six-factor documentation entry points:

- `docs/ml_six_factor_apply_mode.md`
- `docs/ml_six_factor_runtime_policy_adapter.md`
- `docs/ml_six_factor_delivered_config_logging.md`
- `docs/ml_six_factor_app_shadow_integration.md`
