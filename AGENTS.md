# Instructions for Codex (local agent)

Guidance hierarchy:
- `AGENTS.md` = persistent repository-specific operating rules for Codex.
- `VISION.md` = target-state product direction.
- `docs/RESEARCH_SPEC.md` = primary research framing document for dissertation-related and conceptually ambiguous decisions.
- Repository code = source of truth for current implemented behavior.
- Other docs under `docs/` are supporting references only: they may be useful, but they are lower-priority than the items above and may be stale.

Project:
- EduAI is a thesis-defensible prototype.
- Thesis topic: «Разработка прогнозирования оптимального образовательного контента для отдельных обучающихся с использованием машинного обучения».
- The project priority is machine-learning-based prediction and selection of pedagogically meaningful educational actions/content for individual learners.
- When task priorities are ambiguous, prioritize ML, prediction, evaluation, provenance, and data integrity over UI breadth or cosmetic surface expansion.
- The project is not centered on rigid rule-based personalization.
- Learner-facing chat is an educational learning surface, not a general-purpose assistant product.
- Heuristic or rule-based logic may exist only as an explicit baseline, bridge, fallback, comparison layer, or rendering helper. Do not present heuristics as ML.

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

Research framing:
- Follow `docs/RESEARCH_SPEC.md` as the primary research-facing document.
- Distinguish declared preference from inferred preference and effective preference.
- Declared preference = what the learner says they prefer.
- Inferred preference = the system estimate derived from observed behavior and performance.
- Effective preference = what actually yields the best measurable learning result.
- Do not silently overwrite declared preferences with inferred or effective preferences in logic or presentation.
- Working hypotheses:
  - H1: declared preferences do not always match the content parameters that maximize measurable learning result.
  - H2: behavioral and performance data identify effective content parameters more accurately than self-report alone.
  - H3: personalization based on predicted effective preferences outperforms personalization based only on declared preferences.
- Optimal educational content = content that maximizes learning gain.
- First practical baseline proxy for optimality = next-task success probability.
- Time may be used as a secondary metric or operational constraint, not as the main educational objective.
- Tests and structured episode checks are the primary learning signal.
- Learner chat interaction is a secondary behavioral and adaptation signal.
- Exploration is an internal bounded mechanism for data collection and better estimation, not a default public-facing mode.

Current implementation baseline:
- Current runtime still contains bridge/heuristic-heavy logic, explicit baselines, and partial artifact-backed paths.
- Active runtime must not be described as fully model-owned unless current code, artifacts, and docs explicitly support that claim.
- The first implemented pedagogical scope is intentionally narrow. Treat it as a current baseline, not as the strategic limit of EduAI.
- Staged rollout is acceptable: first ML-ready contracts/data/export/serving boundaries, then a limited but serious decision scope.
- Heuristic bridge logic must not silently mutate learner truth or become the hidden owner of learner-facing/state-mutating pedagogical decisions.

Target research architecture:
- Keep these concerns explicit and separated:
  - learner state
  - pedagogical decision
  - materialization/rendering
  - evaluation/export/analytics
- Episode-first learner flow is the main architectural contour.
- Tests and structured episode checks are the primary ownership path; chat and other secondary surfaces must not silently dictate system ownership.
- Tone, style, formatting, wording, and presentation cosmetics are rendering-layer decisions by default, not core ML targets.
- The 10 axes remain an authoring/tagging taxonomy, not a set of equal ML targets.
- Treat `education_level`, `domain`, `context`, and often `task_type` as context/features/constraints.
- Do not keep `micro_complexity` and `cognitive_level` as default first-wave ML targets when they substantially overlap with challenge.
- Keep declared settings, accessibility settings, system inferences, and analytics/learning state distinct.
- Rely on canonical topic structure for core analytics and modeling; user collections are secondary overlays and must not silently replace it.
- Free-form or custom practice may exist for usability, but it is not core modeling or training signal by default.

Decision ownership rule:
- For architecture tasks, first determine whether the change belongs to:
  - learner state
  - pedagogical decision
  - materialization/rendering
  - evaluation/export/analytics
- Learner-facing or state-mutating paths must not silently own pedagogical decisions through heuristics.
- Rules layer materializes, constrains, or renders decisions. It does not become the hidden pedagogical policy owner.

Project invariants:
- Do not present heuristic/statistical proxies as ML.
- Keep prediction policies versioned and comparable.
- Do not break reproducibility, backtesting, calibration, or replay when touching prediction/data pipelines.
- No future leakage.
- No hidden fallbacks.
- No silent heuristic mutation of learner truth.
- UI must not contain core prediction logic.
- Do not expose research or exploration mechanisms as a normal learner-facing mode by default.
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
- For current implemented behavior, trust repository code first.
- Use `VISION.md` for target-state product direction.
- Use `docs/RESEARCH_SPEC.md` for dissertation-related and conceptually ambiguous research framing decisions.
- Treat other docs under `docs/` as secondary references for context and implementation details, not as equal-priority strategic guidance.
- If old or lower-priority docs conflict with `VISION.md`, `docs/RESEARCH_SPEC.md`, or current code, do not treat those docs as strategic guidance by default.
- For current behavior, prefer code over stale docs.
- Do not silently rewrite runtime behavior to match `VISION.md` or `docs/RESEARCH_SPEC.md` unless the task explicitly requires that change.
- Keep `context_seed.md` at the repository root unless the user explicitly asks to move or remove it.

Documentation policy:
- If behavior, architecture, core flow, data model, API contract, prediction policy, or workflow changes, update the relevant docs in `docs/` in the same task.
- If docs are stale after implementation, the task is not complete.

Reports and phone delivery:
- After every non-trivial task, write a markdown report to `codex-report/codex_report_YYYYMMDD_HHMM.md`.
- Keep the report compact and engineering-oriented. Do not inflate it into a long essay or create a false sense of completeness.
- The report must contain at least:
  - task summary,
  - what was changed,
  - changed files,
  - what checks/scripts were run,
  - which checks passed/failed,
  - important remaining limitations if any,
  - `Behavioral change`: what actually changed in system behavior, workflow, contracts, or outputs,
  - `Intentionally not done`: what was deliberately left out of scope,
  - `Weakest remaining point`: the single most important remaining weakness or risk after the task,
  - `Next-step impact`: what this step unlocked, or what still blocks the next stage,
  - report delivery status to phone: successful or failed.
- For code or architecture tasks, include a short `Key touched modules/contracts` section that names the actual modules, interfaces, routes, schemas, APIs, or contracts whose logic changed. Do not just repeat filenames.
- For ML, data, training, evaluation, or prediction tasks, include a short `Data/model honesty note` that states:
  - what is actually trained or implemented,
  - what is not trained yet,
  - what remains heuristic, stub, or bridge logic.
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
