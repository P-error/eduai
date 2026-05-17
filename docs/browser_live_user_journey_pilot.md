# Browser/Live User Journey Pilot

`scripts/browser-live-user-journey-pilot.sh` runs a controlled browser pilot for the current EduAI learner loop. It starts a local Next.js dev server with process-local six-factor flags, drives Chromium with Playwright, creates a controlled learner, uses the UI for the key learner journey events, and verifies DB/provenance/export evidence.

## Scope

The pilot checks:

- UI registration and login;
- UI declared preference persistence;
- UI topic group/topic creation;
- browser-visible learning content and dialogue started from the Learn UI;
- UI postcheck submission;
- second browser-visible learning content after the test outcome, also started from the Learn UI;
- six-factor delivered config, learner-state aggregates, leakage guards, and export validation.

The normal full Learn episode still starts with a precheck. The UI also exposes `Start with explanation` for a learner-facing explanation-first path. The browser pilot uses that UI control for the first `learning_content -> postcheck` episode and again for second learning content after the submitted test outcome.

The pilot may still use DB/API reads for verification/export only. It must not use browser-context API calls to create the controlled learner journey events.

## Run

```bash
bash scripts/browser-live-user-journey-pilot.sh
```

Optional:

```bash
bash scripts/browser-live-user-journey-pilot.sh --headed
bash scripts/browser-live-user-journey-pilot.sh --port 3131
```

The script uses these process-local flags for the dev server:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_APPLY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

It does not enable flags globally and does not modify `.env.local`.

## Live Provider

If `OPENAI_API_KEY` is available to the Next.js server runtime, generated learning content/dialogue/test content can use the configured live provider. If the key is unavailable or the provider call fails, the app falls back according to existing runtime behavior and the pilot reports `LIVE_PROVIDER_UNAVAILABLE` in `liveProvider`.

For local pilot runs, the harness loads server-side LLM variables from project env files, including `.env.local`, into the dev-server child process without printing values and without passing secrets on the command line. This keeps the pilot aligned with the local server env file even when the parent shell has no key or has a stale inherited key.

The script never prints the API key and does not write it to exports or reports.

The verifier checks browser-visible text from `signalsJson.uiThreadText` and `learningContentCard`, not the intentionally redacted `ChatMessage.content` column.

## Outputs

Ignored local outputs:

- `exports/browser_live_user_journey_pilot_results.json`
- `exports/browser_live_user_journey_pilot_training_observations.jsonl`

The export file is filtered by the controlled `user_ref`. UI-created runtime episodes currently use the default `datasetOrigin`, so prefix-based export filtering is not available without changing runtime API contracts.

## Status Meanings

- `BROWSER_LIVE_PILOT_PASS`: key learner journey events are created through UI, live LLM used, no generation fallback, second-chat personalization verified, export validation passed.
- `BROWSER_LIVE_PILOT_PARTIAL`: browser path ran but required API bootstrap/manual setup for key journey events, live provider was unavailable, or another non-core gap remains.
- `BROWSER_LIVE_PILOT_FAIL`: a journey step or assertion failed.
- `DB_UNAVAILABLE`: PostgreSQL was unreachable.
- `LIVE_PROVIDER_UNAVAILABLE`: live provider key/runtime was unavailable before the live path could be checked.

## Cleanup

The script creates a user with prefix `browser_pilot_user_YYYYMMDD_HHMMSS`, one topic group, one topic, evaluation episodes, chat sessions, generated tests, attempts, and export rows. To inspect or clean records, filter by the generated user email prefix in the report or `exports/browser_live_user_journey_pilot_results.json`.

Do not delete unrelated real learner data.

## Research Interpretation

This pilot verifies that the browser-visible workflow and provenance wiring can carry post-test learner-state personalization. It is not evidence of real educational effect, model quality, or learning gain from a single run.
