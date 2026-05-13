# Artifact Inventory

Инвентарь фиксирует различие между активным кодом, canonical examples, generated outputs и локальными архивами.

## Active Source And Config

- `src/` - активный код приложения.
- `configs/active_policy.json` - активный policy config; не архивировать и не перемещать.
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

## ML And Training Outputs

- `training_datasets/synthetic/*` - generated dataset export snapshots. Они нужны для воспроизводимости и могут быть полезны для диссертации, но не должны коммититься как обычный source.
- `training_datasets/real/` - место для real dataset exports; содержимое должно контролироваться отдельно из-за privacy/data integrity.
- `bootstrap_training/assistments_2009_2010/data/` - raw/interim/processed/report outputs offline bootstrap lane.
- `bootstrap_training/eduai_native_synthetic/data/` - generated synthetic bootstrap data.
- `artifacts/runtime/eduai_native_pedagogy/current/` - runtime artifact slot. `slot_metadata.json` и README являются canonical; дополнительные files/artifact outputs generated, но путь читает runtime-код.

## Reports And Audits

- `reports/codex/` - Codex task reports. Legacy `codex_report_*.md` из `codex-report/` перенесены сюда.
- `reports/audits/` - репозиторные аудиты.
- `reports/archive/` - исторические snapshots и одноразовые tree/report outputs.
- `codex-report/` - legacy placeholder; не хранить новые отчёты.

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

## Safe To Archive

Без дополнительной проверки можно архивировать только явно неисполняемые generated outputs: старые Codex reports, tree snapshots, one-off audits, zip/tar review packs, local test result outputs и Python caches.

Нельзя архивировать без проверки: `ml/examples`, `training_datasets`, `artifacts/runtime`, `bootstrap_training`, `configs`, `prisma`, `src`, `scripts`.

## Current Cleanup Action 2026-05-07

- `codex-report/codex_report_*.md` классифицированы как Codex reports и перенесены в `reports/codex/`.
- `codex-report/pass4_prechange_audit_notes.md` классифицирован как audit note и перенесён в `reports/audits/`.
- `ml/examples/*.json*` оставлены на месте: это generated examples, но они нужны ML validation/tests.
- `artifacts/ui-audit-*`, `training_datasets/*`, `bootstrap_training/*` оставлены на месте из-за риска нарушить audit/training reproducibility.
