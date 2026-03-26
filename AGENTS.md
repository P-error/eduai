# Instructions for Codex (local agent)

Project:
- EduAI is a thesis-defensible prototype.
- Thesis topic: «Разработка прогнозирования оптимального образовательного контента для отдельных обучающихся с использованием машинного обучения».
- The project priority is machine-learning-based prediction of optimal educational content for individual learners.
- Rule-based or heuristic logic may exist only as a baseline, fallback, or comparison layer. Do not present heuristics as ML.

Stack:
- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- External LLM provider (OpenAI API compatible)
- JWT auth

Core rules:
- Write code in English.
- Write code comments in Russian.
- Communicate with the user in the CLI in Russian.
- Keep terminal responses extremely short. Full details go to the markdown report.
- Use `src/` structure.
- API routes must be `app/api/**/route.ts`.
- All LLM calls go through `src/lib/llm/provider.ts` (create it if missing).
- Prisma client singleton: `src/lib/prisma.ts`.
- Do not ask technical questions unless they are critical for correctness or safety.
- Do not ask for confirmation by default; ask only for high-risk actions (security, data loss, irreversible changes, breaking public interfaces, large destructive migrations).
- Never commit secrets or tokens.

Project invariants:
- Do not present heuristic/statistical proxies as ML.
- Keep prediction policies versioned and comparable.
- Do not break reproducibility, backtesting, calibration, or replay when touching prediction/data pipelines.
- No future leakage.
- No hidden fallbacks.
- UI must not contain core prediction logic.
- Prefer transparent and auditable logic over flashy but weak claims.

Implementation policy:
- Prefer the smallest change that solves the task without preserving obviously bad architecture.
- If a larger refactor is truly needed to solve the task correctly, do it, but keep the scope controlled.
- Do not add silent workarounds, fake stubs, or hidden behavior.
- For new database tables, add indexes for primary query patterns.
- For temporary data, include TTL/cleanup strategy where appropriate.
- If the user reports a bug, inspect logs/errors/request flow first, then fix the responsible code path.
- Do not spend tokens on broad risk analysis, architectural debate, or alternative designs unless the user explicitly asks for them.
- Do not write long explanatory essays in the CLI output. The report is the main artifact.

Validation policy:
- Run only checks relevant to the changed files and subsystems.
- Do not run `prisma migrate dev` by default.
- If schema changes are required, migrations must be intentional and justified by the task.
- If prediction, evaluation, calibration, export, or data-pipeline code changes, run the relevant self-checks/tests/scripts if they exist.
- Never hide failed checks. If something failed, say so briefly in the CLI response and record details in the report.

Sources of truth:
- Current behavior: repository code + current docs in `docs/`.
- Product vision documents describe target state, not guaranteed current behavior.
- If vision and code/docs conflict, do not auto-rewrite code to match vision unless the user explicitly asks for that change.
- Keep `context_seed.md` at the repository root unless the user explicitly asks to move or remove it.

Documentation policy:
- If behavior, architecture, core flow, data model, API contract, prediction policy, or workflow changes, update the relevant docs in `docs/` in the same task.
- If docs are stale after implementation, the task is not complete.

Reports and phone delivery:
- After every non-trivial task, write a markdown report to `codex-report/codex_report_YYYYMMDD_HHMM.md`.
- The report must contain at least:
  - task summary,
  - what was changed,
  - changed files,
  - what checks/scripts were run,
  - which checks passed/failed,
  - important remaining limitations if any,
  - report delivery status to phone: successful or failed.
- If report delivery failed and the reason is known, include a short failure reason in the report.
- After writing the report, send/sync it to the phone using the existing local report-delivery workflow/script configured in the repository.
- If report delivery fails, still save the report locally.
- Do not treat terminal output as a substitute for the markdown report.
- Do not leave report/archive artifacts in the repository root.

CLI response format:
- The CLI response to the user must be short and in Russian.
- Output only these four lines:
  - `Задача: Да/Нет`
  - `Результат: <одна короткая строка>`
  - `Проверки: <не запускались / все пройдены / кратко перечислить непройденные>`
  - `Отчёт на телефон: Да/Нет`
- Do not add anything else to the CLI response.

Local artifacts:
- Save transient Codex reports under `codex-report/`.
- Save local archive artifacts under `eduai-clean/`.
- Do not leave temporary junk files in the repository root.

Tag axes (10):
- education_level
- tone
- style
- format
- depth
- cognitive_level
- task_type
- micro_complexity
- domain
- context

Tagging rule:
- One tag per axis per question.
