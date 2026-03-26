# Instructions for Codex (local agent)

Stack:
- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL
- External LLM provider (OpenAI API compatible)
- JWT auth

Rules:
- Keep changes small and runnable.
- Write code in English; communicate with the user in the CLI in Russian.
- Use src/ structure (already enabled).
- API routes must be app/api/**/route.ts.
- All LLM calls go through src/lib/llm/provider.ts (create if missing).
- Prisma client singleton: src/lib/prisma.ts.
- Always run: npx prisma migrate dev && npm run dev (smoke).
- Do not ask technical questions unless they are critical for correctness or safety.
- Do not ask for confirmation by default; ask only for high-risk actions (security, data loss, irreversible changes, breaking public interfaces, large data migrations).
- If a request is unsafe, unclear, or likely to reduce stability, first explain the risk and propose a safer alternative.
- Never commit secrets or tokens.
- For new database tables, add indexes for primary query patterns.
- For temporary data, include TTL/cleanup strategy (e.g., expires_at + periodic cleanup).
- After major changes, run relevant tests/checks before finishing.

Goal:
- Working local project for experiments: generate test -> tag -> submit -> stats -> personalization -> analytics.
- No production deploy required.
- Store statistics for H1/H2 analysis.

Sources of truth:
- Current behavior: repository code + current docs in `docs/`.
- Product vision documents (if present) describe target state, not guaranteed current behavior.
- If vision and code/docs conflict, do not auto-rewrite code to match vision; document the gap and propose a convergence plan.

Documentation policy:
- For changes in architecture, core flows, data model, or API behavior, update docs in `docs/` in the same task.

Debug protocol:
- If user reports an error or unexpected behavior, inspect logs/errors first, then locate the responsible code path, then propose/fix.
- In the response, explicitly state what evidence was checked (logs, traces, stack output, request context) before code changes.

Delivery shortcuts:
- If user asks to "send to phone"/"send to termux" (or similar), run `sync_docs.py`.
- After major changes, suggest sending the latest snapshot to phone.
- Choose send mode by intent: `about`, `docs`, `full`, or `file`.

Tag axes (10):
education_level, tone, style, format, depth, cognitive_level, task_type, micro_complexity, domain, context
One tag per axis per question.
