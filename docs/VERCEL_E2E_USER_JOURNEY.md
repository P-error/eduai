# Vercel E2E User Journey Smoke

`scripts/e2e-vercel-user-journey.sh` runs an API-level smoke/audit against the deployed app from registration through topic setup, Learn episodes, personalization readiness, and learner analytics.

Run:

```bash
E2E_BASE_URL="https://your-vercel-app.example" scripts/e2e-vercel-user-journey.sh
```

The script intentionally exits non-zero if `E2E_BASE_URL` is missing. It creates a unique test user and entities with an `E2E_<timestamp>` prefix and writes the run report to:

```text
codex-report/e2e_user_journey_<timestamp>.md
```

Coverage:

- registration/login and `/api/users/me`;
- `Collection` as topic group, `Subject` as topic, `SubjectSection` as section/subtopic, including nested sections;
- `/learn` episode API flow with `precheck -> learning_content -> postcheck -> holdout` when `includeHoldout=true`;
- learning dialogue during the first episode;
- learner stats, dashboard, predictions, prediction metrics, and subject stats;
- detection of `LOW_UX_COMPLIANCE` exclusions on fresh episode attempts.

Current personalization readiness criterion from code:

- `axesReady >= 4`;
- `testsTaken >= 5`;
- per-tag readiness uses `totalCount >= 5`;
- `testsTaken` increments only for submissions that are learning-eligible.

Limitations:

- This is API-level coverage. It fetches key pages but does not click UI controls.
- It does not read Vercel runtime logs. The owner should manually inspect logs for `[eduai.learning_quality_gate]`, LLM errors, Prisma errors, episode orchestration errors, and analytics endpoint errors.
- It does not modify production logic, seed the database directly, bypass quality gates, or read server-only correct answers.
