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

Goal:
- Working local project for experiments: generate test -> tag -> submit -> stats -> personalization -> analytics.
- No production deploy required.
- Store statistics for H1/H2 analysis.

Tag axes (10):
education_level, tone, style, format, depth, cognitive_level, task_type, micro_complexity, domain, context
One tag per axis per question.
