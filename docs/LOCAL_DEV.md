# Local Development Bootstrap

Goal: fresh clone -> install -> lint/build (offline-safe) -> run dev with local PostgreSQL.

## Prerequisites
- Node.js 20+ and npm
- Docker + Docker Compose plugin (`docker compose`)

## 1) Install dependencies

```bash
npm ci
```

If lockfile updates are expected, use:

```bash
npm install
```

## 2) Configure env

Copy local env template:

```bash
cp .env.example .env.local
```

Required values in `.env.local`:
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- optional `OPENAI_BASE_URL`
- optional `CHAT_STORE_RAW_CONTENT`
- optional `DATASET_EXPORT_SECRET`

## 3) Start local DB (Docker)

```bash
npm run db:up
```

Compose defaults:
- host: `localhost`
- port: `5432`
- db: `eduai`
- user: `eduai`
- password: `eduai_dev_password`

Stop DB:

```bash
npm run db:down
```

Reset DB data (destructive):

```bash
npm run db:reset
```

## 4) Run Prisma migration

```bash
npm run prisma:migrate
```

`prisma:migrate` has no hardcoded fallback URL.
Prisma resolves `DATABASE_URL` from shell env or `.env.local`/`.env`.
If `DATABASE_URL` is missing/invalid, command fails with a clear Prisma error.
This prevents accidental migrations against an implicit default database.
This command is local-development oriented (`prisma migrate dev`).
For deployment/CI use `prisma migrate deploy` as documented in `docs/DEPLOYMENT.md`.

Optional one-off override (explicit target DB):

```bash
DATABASE_URL="postgresql://eduai:eduai_dev_password@localhost:5432/eduai?schema=public" npm run prisma:migrate
```

Schema-only check (no DB required):

```bash
npx prisma validate
```

## 5) Run quality checks

```bash
npm run lint
npm run build
```

Build is offline-safe with system/local font stack (no `next/font/google` fetch required).

## 6) Start app

```bash
npm run dev
```

Convenience command:

```bash
npm run dev:local
```

(`dev:local` runs migration first, then starts dev server.)

## Common Errors

### `P1001: Can't reach database server`
Cause: Postgres not running or wrong `DATABASE_URL`.

Fix:
1. `npm run db:up`
2. check `DATABASE_URL` points to `localhost:5432`
3. rerun `npm run prisma:migrate`

### Port conflict on `5432`
Cause: another Postgres is already using port 5432.

Fix options:
1. stop conflicting service;
2. change compose host port and update `DATABASE_URL`.

### `docker compose` not found
Install Docker Compose plugin or Docker Desktop; verify with:

```bash
docker compose version
```

### Build failing due remote fonts
If this appears, check that `src/app/layout.tsx` does not import `next/font/google` and uses local/system font stack.

### Next warning about multiple lockfiles
If you see a warning about lockfiles outside this repo (for example parent directory lockfiles in sandbox environments), it is an environment artifact.
`next.config.ts` pins tracing/Turbopack root to this repo to reduce ambiguity.
In a normal clone, keep a single repo lockfile: `package-lock.json` in project root.
