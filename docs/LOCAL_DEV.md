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

The local template points runtime to the THU six-factor ML scorer. ML/apply is explicit-on:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_APPLY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

For a fast local rollback, set `EDUAI_SIX_FACTOR_APPLY=0`, `EDUAI_SIX_FACTOR_SHADOW_ONLY=1`, or `EDUAI_SIX_FACTOR_ML_POLICY=0` for legacy fallback.

Prediction accuracy ML-first is separate from the six-factor scorer. To generate the local accuracy artifact from runtime-eligible data:

```bash
DATABASE_URL="postgresql://eduai:eduai_dev_password@localhost:5432/eduai?schema=public" \
DIRECT_URL="postgresql://eduai:eduai_dev_password@localhost:5432/eduai?schema=public" \
npm run ml-accuracy:train
```

If this reports `insufficient_data`, keep `configs/active_policy.json` on `heuristic_baseline`.
The generated default path `configs/ml_accuracy_logreg_artifact.local.json` is ignored by Git; it is local/dev unless a reviewed artifact is deployed separately.
Do not use `EDUAI_ML_ELIGIBLE_ONLY=false`, `EDUAI_ML_CONSENT_ONLY=false`, or synthetic data to claim ML-first runtime readiness.

To force the DEV `artifact_ml` pipeline for technical verification only:

```bash
EDUAI_ML_SOURCE=synthetic \
EDUAI_ML_ARTIFACT_PATH=configs/ml_accuracy_logreg_artifact.dev.json \
npm run ml-accuracy:train
npm run prediction-runtime:dev-self-check
```

`configs/ml_accuracy_logreg_artifact.dev.json` is a synthetic DEV artifact.
It can make `expected_accuracy` return `sourceType=ml_artifact`, but it is not
production eligible and is not research evidence. The strict gate remains:

```bash
npm run prediction-runtime:self-check
```

With the synthetic DEV artifact active, that strict gate should fail with
`synthetic_artifact_not_ml_first_eligible`.

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
DATABASE_URL="postgresql://eduai:eduai_dev_password@localhost:5432/eduai?schema=public" npm run prisma:migrate:deploy
```

Operationally aligned local verification should use the compose DB URL shown above and `prisma migrate deploy`.
`prisma migrate dev` remains local schema-authoring tooling, not the pilot/deploy path.

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

`dev:local` is now the recommended local startup path for auth-sensitive work.
It auto-starts the compose PostgreSQL container, forces the compose-aligned local DB URL unless `EDUAI_LOCAL_DATABASE_URL` is explicitly provided, runs `prisma migrate deploy`, then starts the dev server.

Use plain `npm run dev` only when:
- Postgres is already running;
- `DATABASE_URL` is already pointed at the intended DB;
- you intentionally do not want the compose bootstrap.

## 7) Controlled pilot-like startup

Use this path when you want the local environment to behave like the current
pilot contour instead of a normal dev loop:

```bash
npm run db:up
npm run prisma:migrate:deploy
npm run build
npm run start
```

Binary operational checks after startup:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
npm run auth:self-check
npm run pilot-readiness:smoke
```

What each signal means:
- `/api/health` confirms the process is alive.
- `/api/ready` is the pilot-readiness gate for DB/runtime/config dependencies.
- `auth:self-check` verifies register/login/logout/cookie/me behavior against the live auth handlers.
- `pilot-readiness:smoke` verifies the controlled learner/admin contour end-to-end.

## Common Errors

### `P1001: Can't reach database server`
Cause: Postgres not running or wrong `DATABASE_URL`.

Fix:
1. `npm run db:up`
2. check `DATABASE_URL` points to `localhost:5432`
3. prefer `npm run dev:local` for the local auth/dev path
4. rerun `npm run auth:self-check`

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
