# Cleanup Policy

Политика нужна, чтобы организационная уборка не меняла runtime-логику и не ломала research reproducibility.

## Куда класть новые материалы

- Codex task reports: `reports/codex/codex_report_YYYYMMDD_HHMM.md`.
- Project audits/reviews: `reports/audits/`.
- Старые одноразовые отчёты и tree snapshots: `reports/archive/`.
- ML evaluation summaries, если они не принадлежат конкретному training lane: `reports/ml/`.
- Bulky local archives, source snapshots, tar/zip review packs: `eduai-clean/archive/`.
- Runtime ML artifact slot: только `artifacts/runtime/eduai_native_pedagogy/current/`, если задача явно касается artifact serving.

## Что нельзя хранить в корне

- `codex_report_*.md`
- `repo_tree_*.txt`, `repo_audit_*.md`, one-off tree snapshots
- `*.zip`, `*.tar.gz` review/source packs
- `outputs/` review/export packs
- `test-results/`
- Python caches и локальные virtualenv folders

Исключение: активные project files вроде `README.md`, `VISION.md`, `AGENTS.md`, `context_seed.md`, config/build files и package locks.

Legacy path `codex-report/` может оставаться как placeholder, но новые task reports должны сохраняться в `reports/codex/`.

## Naming

- Codex reports: `codex_report_YYYYMMDD_HHMM.md`.
- Audit reports: descriptive snake_case name with optional date, например `repository_audit_YYYYMMDD.md`.
- Archive folders: keep original package name when possible; add date suffix only when moving generated tool output.
- ML evaluation reports: include dataset/artifact/policy id where practical.

## Перед перемещением

1. Проверить `rg` по имени файла, имени директории и ключевым basename.
2. Проверить `package.json`, `tsconfig.json`, `eslint.config.mjs`, pytest/pyproject config и shell scripts.
3. Проверить, не является ли файл test fixture или canonical contract example.
4. Проверить docs, если путь documented как canonical или runtime slot.
5. Если есть сомнение, не перемещать; зафиксировать риск в cleanup report.

Для six-factor shadow работ отдельно проверять:

- `EDUAI_SIX_FACTOR_SHADOW` по умолчанию выключен;
- `buildOptionalSixFactorShadowMetadata(...)` возвращает `null` при выключенном flag;
- prompt/render package не получает six-factor instructions без отдельного apply-флага;
- technical test `response_format` остаётся `mcq`.

## Что не считается безопасным cleanup

- Переименование `src/**`, `prisma/**`, `configs/**`, `ml/src/**`, `ml/scripts/**`, `ml/tests/**`.
- Перемещение `ml/examples/**` без изменения tests/contracts и отдельной ML migration-задачи.
- Перемещение `artifacts/runtime/**`, если runtime code читает текущий путь.
- Массовое форматирование, code style cleanup или изменение imports.
- Подмена generated artifact свежим stub-файлом.
