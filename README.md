# EduAI (Thesis Prototype)

EduAI is a thesis-defensible prototype for machine-learning-based prediction of optimal educational content for individual learners.
It is not a production LMS: the system is designed to be transparent, auditable, and honest about data quality and model availability.
`docs/RESEARCH_SPEC.md` is the primary research framing document; `VISION.md` describes the target-state product direction.

Research framing:
- declared preference = what the learner says they prefer;
- effective preference = what actually produces the best measurable learning result;
- optimal educational content = content that maximizes learning gain;
- first practical baseline proxy for optimality = next-task success probability;
- time is a secondary metric or operational constraint, not the main educational objective.

System framing:
- ML prediction layer: predicts pedagogically meaningful variables; current dissertation focus is `difficulty` + `explanation depth`.
- Rule-based rendering layer: materializes those decisions into tone, style, format, and presentation.
- Heuristic or stub logic may exist only as an honest baseline, fallback, or comparison layer. It must not be presented as ML.

Core product surface:
- Learn: educational chat with personalization mode on/off.
- Practice: test generation + submission with telemetry.
- Profile: declared/effective preference view with confidence and limitations.
- Insights: prediction policy status, support metrics, and calibration summary.
- Admin: data quality, personalization, prediction, chat, and test observability.

## Quickstart

1. Install dependencies:

```bash
npm ci
```

2. Configure env:

```bash
cp .env.example .env.local
```

Required values:
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional; OpenAI-compatible provider)
- `CHAT_STORE_RAW_CONTENT` (optional, `1` enables raw chat storage; default is redacted storage)

3. Start local Postgres:

```bash
npm run db:up
```

4. Run Prisma migration:

```bash
npm run prisma:migrate:deploy
```

5. Run local app:

```bash
npm run dev:local
```

`dev:local` now auto-starts the compose PostgreSQL service, applies `prisma migrate deploy` against the compose-aligned local DB URL, then starts Next.js.
Use plain `npm run dev` only when the database is already up and you intentionally want a custom `DATABASE_URL`.

Offline build/lint checks:

```bash
npm run lint
npm run build
```

## Pilot-Like Local Startup

For a controlled pilot-style local startup, use the deployment-aligned path:

```bash
npm run db:up
npm run prisma:migrate:deploy
npm run build
npm run start
```

Operational signals:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
npm run auth:self-check
npm run pilot-readiness:smoke
```

## Minimal demo flow

1. Login from `/login`.
2. Create subject(s) in `/subjects`.
3. Generate a test from `/practice`.
4. Submit attempt and inspect result panel (prediction vs actual + learning quality note).
5. Use `/learn` chat in Personalized/Standard mode.
6. Open `/profile` and `/insights`.
7. For admin users (`@eduai.com`): inspect `/admin/*` dashboards.

## Canonical docs

`docs/RESEARCH_SPEC.md` describes the dissertation-facing research framing.
`VISION.md` describes the target-state product direction.
See `docs/INDEX.md` for the complete v2 documentation set.
For full local bootstrap/troubleshooting, see `docs/LOCAL_DEV.md`.
For GitHub/Vercel deployment flow, see `docs/DEPLOYMENT.md` and `docs/RELEASE_CHECKLIST.md`.

For bootstrapping a new ChatGPT thread with full current state, use `context_seed.md`.
