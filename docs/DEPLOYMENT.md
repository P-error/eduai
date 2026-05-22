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
- `EDUAI_SIX_FACTOR_SHADOW=1`
- `EDUAI_SIX_FACTOR_ML_POLICY=1`
- `EDUAI_SIX_FACTOR_APPLY=1`
- `EDUAI_SIX_FACTOR_SHADOW_ONLY=0`
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`
- six-factor ML/apply is explicit-on in env examples: `EDUAI_SIX_FACTOR_SHADOW=1` builds metadata/logging, `EDUAI_SIX_FACTOR_ML_POLICY=1` enables artifact candidate scoring for the primary six-factor pedagogical decision, `EDUAI_SIX_FACTOR_APPLY=1` applies the selected profile to learner-facing prompts, and `EDUAI_SIX_FACTOR_SHADOW_ONLY=1` means scoring/logging without learner-facing apply.
- legacy prediction accuracy/time ML-first additionally requires `configs/active_policy.json` to use `backend.kind=artifact_ml` and a valid runtime-eligible accuracy artifact. If the artifact is absent, synthetic-only, unfiltered, or insufficiently evaluated, keep the explicit heuristic fallback and let readiness/self-check report the blocker.
- `configs/ml_accuracy_logreg_artifact.dev.json` is a forced DEV pipeline artifact. It may be deployed only for a clearly marked demo of the runtime path. Do not use it as a production artifact or research evidence; production readiness must use `npm run prediction-runtime:self-check`, not the DEV self-check.
- `NEXT_PUBLIC_SHOW_ML_PERSONALIZATION` is a UI visibility/debug flag only; it does not enable or disable the runtime six-factor decision.

Production startup now fails fast on invalid critical env:
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- invalid `OPENAI_BASE_URL`

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
   - For the THU ML scorer, add the `EDUAI_SIX_FACTOR_*` values from `.env.production.example`; these repository templates do not configure hosted env automatically.
   - For legacy prediction accuracy/time ML-first, deploy a reviewed artifact generated from eligible+consented data. `configs/*.local.json` is ignored by Git, so do not assume the local default artifact path will exist on Vercel.
   - The tracked DEV accuracy artifact is included in the repository for demo/runtime verification. If you deploy it to Vercel, label the deployment as DEV ML runtime and keep `mlFirstProductionEligible=false` visible in `/api/ready` and admin diagnostics.
3. Run migrations from CI/job/terminal against production DB:
   - `npx prisma migrate deploy`
4. Trigger Vercel deploy.
5. Verify operational endpoints:
   - `/api/health`
   - `/api/ready`
6. Run the canonical smoke suite from an environment with real runtime secrets:
   - `npm run pilot-readiness:smoke`

## 5) Runtime Readiness Notes

`/api/ready` is the canonical runtime gate for pilot use.
It verifies:
- DB reachability
- Prisma/runtime DB contract
- auth/session config sanity
- external rate limiter backend reachability
- legacy prediction accuracy/time runtime interpretability
- artifact slot/runtime artifact interpretability
- legacy accuracy artifact path/status/schema/model diagnostics when accuracy ML-first is configured
- required LLM config sanity

When the forced DEV accuracy artifact is active and schema-valid, `/api/ready`
may return HTTP 200 with a warning instead of HTTP 503: the runtime path is ready,
but `mlFirstProductionEligible=false` and `researchEvidence=false`. Treat that as
demo-safe, not production ML-first readiness.
