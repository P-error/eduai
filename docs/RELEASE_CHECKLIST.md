# Release Checklist (Public Demo / Vercel)

## Pre-release

1. Confirm no secrets are committed:
   - check `.env*` is excluded
   - scan recent changes for tokens/keys
2. Run local quality checks:
   - `npm run lint`
   - `npm run build`
   - `npx prisma validate`
3. Ensure production envs are set in Vercel:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `OPENAI_API_KEY`
4. Confirm `DATASET_EXPORT_SECRET` is set for production export hygiene.

## Database

1. Run migrations against target database:
   - `npx prisma migrate deploy`
2. Verify migration result in logs.
3. If applicable, run seed/bootstrap scripts intentionally (not automatically in build).

## Deploy

1. Deploy from GitHub to Vercel.
2. Verify build logs:
   - Prisma client generation completed
   - no migration command executed during build
3. Smoke-test:
   - auth login/register
   - test generation and submit flow
   - admin prediction pages

## Post-release

1. Validate basic observability:
   - app routes return expected status codes
   - admin metrics endpoints respond
2. Rotate secrets immediately if any leak is suspected.
