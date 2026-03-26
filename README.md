# EduAI (Thesis Prototype)

EduAI is an educational personalization prototype for thesis defense.
It is not a production LMS: the system is designed to be transparent, auditable, and honest about data quality.

Core product surface:
- Learn: educational chat with personalization mode on/off.
- Practice: test generation + submission with telemetry.
- Profile: UX + pedagogy profile with confidence and limitations.
- Insights: prediction proxies and calibration summary.
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
npm run prisma:migrate
```

5. Run local app:

```bash
npm run dev
```

Offline build/lint checks:

```bash
npm run lint
npm run build
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

See `docs/INDEX.md` for the complete v2 documentation set.
For full local bootstrap/troubleshooting, see `docs/LOCAL_DEV.md`.
For GitHub/Vercel deployment flow, see `docs/DEPLOYMENT.md` and `docs/RELEASE_CHECKLIST.md`.

For bootstrapping a new ChatGPT thread with full current state, use `context_seed.md`.
