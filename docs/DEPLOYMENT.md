# Deployment Guide (GitHub + Vercel)

## 1) Required Production Environment Variables

| Name | Purpose | Used in |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection for Prisma | `prisma/schema.prisma`, `src/lib/prisma.ts` |
| `JWT_SECRET` | JWT signing/verification secret | `src/lib/auth.ts` |
| `OPENAI_API_KEY` | LLM provider API auth | `src/lib/llm/provider.ts` |

Optional variables:
- `OPENAI_BASE_URL` (defaults to OpenAI-compatible `/v1`)
- `CHAT_STORE_RAW_CONTENT` (privacy control, default redacted storage)
- `DATASET_EXPORT_SECRET` (recommended for export pseudonymization; falls back to `JWT_SECRET` only outside production)

## 2) Build and Prisma Strategy

### Install/build behavior
- `postinstall` runs `npm run prisma:generate`.
- `build` runs `next build --webpack`.
- Build must not run migrations.

### Migration strategy (recommended)
1. Run migrations outside Vercel build using:
   - `npx prisma migrate deploy`
2. Deploy application build after database is in expected schema state.

Why:
- `prisma migrate dev` is local-dev only.
- `migrate deploy` is deterministic and safe for CI/CD workflows.

## 3) Vercel Configuration Notes

- Default Vercel settings are sufficient; no custom `vercel.json` is required for this project.
- API routes are explicitly pinned to Node runtime (`export const runtime = "nodejs"`), which is required for Prisma compatibility.
- `next.config.ts` pins `outputFileTracingRoot` / `turbopack.root` to repo root to reduce lockfile root ambiguity warnings.

## 4) Suggested Deployment Flow

1. Push repository to GitHub (without secrets).
2. Configure env vars in Vercel Project Settings.
3. Run migrations from CI/job/terminal against production DB:
   - `npx prisma migrate deploy`
4. Trigger Vercel deploy.
5. Smoke-test critical routes:
   - `/api/auth/login`
   - `/api/tests/generate`
   - `/api/tests/[id]/submit`
   - `/api/users/me`
