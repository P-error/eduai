# Artifact Inventory

Инвентарь фиксирует различие между активным кодом, canonical examples, generated outputs и локальными архивами.

## Active Source And Config

- `src/` - активный код приложения.
- `src/lib/ml-six-factor-*.ts` - активный six-factor pedagogical runtime: contract, loader, candidate generator, adapter, apply, shadow and delivered-config metadata.
- `configs/active_policy.json` - активный policy config; не архивировать и не перемещать.
- `configs/ml_accuracy_logreg_artifact.dev.json` - tracked synthetic/dev accuracy artifact selected by the current tracked active policy. It is useful for runtime wiring and demo diagnostics, but it is not production evidence.
- `prisma/schema.prisma`, `prisma/migrations/` - database/schema source of truth.
- `scripts/` - self-check scripts, привязанные к `package.json`.
- `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts` - app/build config.

## ML Contracts And Canonical Examples

- `ml/contracts/*.md` - research/engineering contracts.
- `ml/schemas/*.json` - JSON schemas.
- `ml/examples/*.json`, `ml/examples/*.jsonl` - generated examples, но currently required:
  - загружаются через `ml/src/eduai_ml/contracts.py`;
  - валидируются `ml/scripts/validate_ml_contracts.py`;
  - используются `ml/tests/test_schema_validation.py` и related tests;
  - упоминаются в `ml/README.md` и `ml/contracts/*`.

`ml/examples` не перемещался, потому что это canonical validation surface, а не одноразовый output.

## Runtime Artifacts

- `configs/ml_accuracy_logreg_artifact.dev.json` - current tracked DEV artifact for expected-accuracy runtime wiring. Source mode is synthetic, so it is not real-user learning-effect proof.
- `configs/*.local.json` - ignored local artifacts, including locally generated runtime-eligible accuracy artifacts.
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json` - current tracked six-factor scorer artifact used by the default six-factor loader path unless env overrides it.
- `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/runtime_manifest.json` - tracked runtime manifest for the current THU scorer.
- `artifacts/runtime/eduai_native_pedagogy/current/README.md` and `slot_metadata.json` - slot-convention metadata. Do not treat `current/` as the current default six-factor scorer path unless the code is changed to read it.

The THU six-factor scorer ranks candidate configs with `difficulty`, `depth`, `support_level`, `presentation_format`, `examples_level`, and `terminology_level`. Current provenance is synthetic/bootstrap, so it verifies integration and provenance behavior rather than real-user learning improvement.

## ML And Training Outputs

- `training_datasets/synthetic/*` - generated dataset export snapshots. Они нужны для воспроизводимости и могут быть полезны для диссертации, но не должны коммититься как обычный source.
- `training_datasets/real/` - место для real dataset exports; содержимое должно контролироваться отдельно из-за privacy/data integrity.
- `bootstrap_training/assistments_2009_2010/data/` - raw/interim/processed/report outputs offline bootstrap lane.
- `bootstrap_training/eduai_native_synthetic/data/` - generated synthetic bootstrap data.

## Reports And Audits

- `codex-report/` - canonical current location для новых Codex/task reports.
- `reports/codex/` - legacy/archive location для старых Codex reports. Новые отчёты сюда не писать.
- `reports/audits/` - репозиторные аудиты.
- `reports/archive/` - исторические snapshots и одноразовые tree/report outputs.
- Не создавать дубли одного Codex/task report одновременно в `codex-report/` и `reports/codex/`.

## Local Archives

- `eduai-clean/archive/audit_review_package/` - старый external review/source snapshot package.
- `eduai-clean/archive/review_pack/` - старый review pack/source snapshot.
- `eduai-clean/archive/outputs/` - старый generated review output pack и tarball.
- `eduai-clean/archive/eduai_repo_structure_snapshot_20260403_1130.zip` - старый zip snapshot.
- `eduai-clean/archive/test-results_20260507/` - старый generated test output.
- `eduai-clean/archive/root_pycache_20260507/` - старый root Python cache.

Эти архивы не являются активным source tree и не должны участвовать в build/imports/tests.

## Better Not Commit

- `.next/`, `node_modules/`, `.logs/`
- `*.log`, `*.tsbuildinfo`, Python cache files
- virtualenv folders: `.venv/`, `venv/`, `env/`
- `test-results/`, `outputs/`
- bulky archives and review/source snapshot packs under `eduai-clean/`
- raw user data or private dataset exports

## Safe To Archive

Без дополнительной проверки можно архивировать только явно неисполняемые generated outputs: старые Codex reports, tree snapshots, one-off audits, zip/tar review packs, local test result outputs и Python caches.

Нельзя архивировать без проверки: `ml/examples`, `training_datasets`, `artifacts/runtime`, `bootstrap_training`, `configs`, `prisma`, `src`, `scripts`.

## Current Cleanup Action 2026-05-07

- `codex-report/codex_report_*.md` классифицированы как Codex reports и перенесены в `reports/codex/`.
- `codex-report/pass4_prechange_audit_notes.md` классифицирован как audit note и перенесён в `reports/audits/`.
- `ml/examples/*.json*` оставлены на месте: это generated examples, но они нужны ML validation/tests.
- `artifacts/ui-audit-*`, `training_datasets/*`, `bootstrap_training/*` оставлены на месте из-за риска нарушить audit/training reproducibility.

Historical cleanup notes do not override the runtime artifact paths documented above.
Это историческое cleanup-действие не задаёт текущую policy для новых task reports. Текущая policy 2026-05-18: новые Codex/task reports сохраняются в `codex-report/`, а `reports/codex/` остаётся legacy/archive path.
