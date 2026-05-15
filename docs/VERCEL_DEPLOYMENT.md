# Vercel Deployment

This project is prepared for Vercel with Neon PostgreSQL through Prisma. Do not commit real secrets to the repository.

## Required Vercel Environment Variables

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`

Optional runtime variables:

- `OPENAI_BASE_URL`
- `CHAT_STORE_RAW_CONTENT`
- `DATASET_EXPORT_SECRET`
- `EDUAI_SIX_FACTOR_SHADOW`
- `EDUAI_SIX_FACTOR_ML_POLICY`
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH`
- `EDUAI_SIX_FACTOR_APPLY`

After changing any Vercel environment variable, redeploy the application so the new runtime receives the updated values.

## Neon URL Strategy

Create a Neon PostgreSQL project and use two connection strings:

- `DATABASE_URL`: Neon pooled/runtime connection string for the Vercel application.
- `DIRECT_URL`: Neon direct/unpooled connection string for Prisma migrations.

Prisma uses `DATABASE_URL` at runtime and `DIRECT_URL` for migration commands. For local docker-compose development both values can point to the same local PostgreSQL URL.

## Production Migration Workflow

Run production migrations intentionally, outside normal application requests:

```bash
npm run prisma:migrate:deploy
```

Run this command before the first production deploy and after every release that adds new files under `prisma/migrations/**`. The command must run with production `DATABASE_URL` and `DIRECT_URL` set for the target Neon database.

Do not use these commands in production:

- `prisma migrate dev`: development-only workflow that may create or adjust migrations interactively.
- `prisma db push`: bypasses the migration history and weakens deploy reproducibility.

The existing Vercel build should not run `prisma migrate deploy` automatically. Keep migrations as an explicit deployment step so schema changes are auditable and not hidden inside a build.

## Artifact Runtime Check

The production example points `EDUAI_SIX_FACTOR_ARTIFACT_PATH` to:

```text
artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

Before enabling artifact-backed flags in Vercel, confirm that this file is included in the deployment source. If the artifact is not deployed, either commit/include it intentionally or leave the artifact-backed flags disabled in Vercel environment variables.

## First Admin User

Registration creates regular users only. Admin access depends on `User.isAdmin = true`; email domain is not an access signal.

Do not add a public admin bootstrap endpoint or hardcoded admin credentials. For an operator-only deployment, create a normal account through `/register`, then promote that account with a one-off, access-controlled database operation.

Example manual SQL, run only by the database owner/operator:

```sql
UPDATE "User"
SET "isAdmin" = true
WHERE "email" = '<operator-email>';
```

Then log in normally with that account and open `/api/ready` or the admin pages.
