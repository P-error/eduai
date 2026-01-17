# Project instructions for Codex

Stack:
- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma 6.x + PostgreSQL
- External LLM provider (OpenAI API compatible)
- Auth: JWT (JWT_SECRET)

Rules:
- Prefer small, reviewable commits.
- Do not remove existing API routes; extend them.
- Keep Prisma singleton in src/lib/prisma.ts.
- All new API routes must be in app/api/**/route.ts.
- All LLM calls must go through src/lib/llm/provider.ts (create if missing).
- Always run: npm run lint (if exists), npx prisma migrate dev, npm run dev smoke test.

Deliverables:
- Working local dev: generate test -> tag -> submit -> stats -> personalization -> admin analytics
- No production deployment required.
- Store enough data for research analytics (before/after personalization, H1 mismatch report).

Tag axes (10):
education_level, tone, style, format, depth, cognitive_level, task_type, micro_complexity, domain, context
One tag per axis per question.
