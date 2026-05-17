# Full User Journey E2E

`scripts/full-user-journey-e2e.sh` is a runnable API/DB-level regression scenario for the current EduAI user journey:

registration/login -> profile preferences -> subject creation -> learning content/chat-session -> controlled test submit -> learner statistics update -> second learning content/chat-session -> real_user export validation.

## Why API/DB-Level

The repository currently has no Playwright, Cypress, Jest, Vitest, or `npm test` script. The real `/api/chat` path calls the external LLM provider, so this check avoids browser automation and external LLM/API calls. It uses:

- real auth routes for registration/login;
- real preferences and subject routes;
- real learning-content generation helper with deterministic fallback content;
- real test submit route;
- real Prisma records and evaluation episode records;
- real six-factor shadow/ML/apply/export helpers.

This is therefore a functional product-path check, not a browser/live-LLM E2E.

## Run

```bash
bash scripts/full-user-journey-e2e.sh
```

Optional:

```bash
bash scripts/full-user-journey-e2e.sh \
  --out exports/full_user_journey_e2e_real_user_training_observations.jsonl \
  --artifact artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json \
  --seed 42 \
  --mock-content
```

The script sets these flags only inside its own process:

- `EDUAI_SIX_FACTOR_SHADOW=1`
- `EDUAI_SIX_FACTOR_ML_POLICY=1`
- `EDUAI_SIX_FACTOR_APPLY=1`
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH=<artifact>`
- `EDUAI_SYNTHETIC_DISABLE_LLM=1`

It does not edit `.env`, `.env.local`, `configs/active_policy.json`, Prisma schema, or UI files.

## Success Classification

- `FULL_PASS`: browser-level journey, live or explicitly configured test LLM path, evidence/provenance flow, and export validation all pass.
- `PARTIAL_PASS`: API/DB journey passes, export validates, and the second six-factor feature snapshot reflects post-test learner-state aggregates. Browser registration and live LLM remain untested.
- `FAIL`: the journey or evidence/provenance chain is broken at a specific step.

The script treats missing post-test aggregate features in the second six-factor feature snapshot as `FAIL`, even if the product flow itself runs. This answers the research-critical question directly: the app must not claim post-test six-factor personalization if the six-factor input does not ingest the new learner-state evidence.

## Second Decision Same vs Different

The selected six-factor config does not have to change after the test. A valid result only requires:

- the policy is recomputed after the outcome;
- the second pre-decision features include updated learner-state evidence;
- no outcome fields are copied into `pre_decision_features`;
- the second delivered config is valid six-factor metadata;
- export produces valid `training_observation.v1` rows.

If the config remains the same but the features changed and policy was recomputed, that is acceptable. If only `previousDifficulty`/`previousDepth` changed while prior/recent correctness remains absent, the check reports a gap.

## Aggregate Feature Expectations

The second content event must show updated pre-decision aggregate fields after test submit:

- `priorAttemptsCount >= 1`
- `recentAttemptsCount >= 1`
- `priorCorrectRate != null` or `recentCorrectRate != null`
- `topicSeenCount != null`
- no forbidden outcome fields in `featuresSnapshot` or exported `pre_decision_features`

These fields are built from historical `TestAttempt` records and episode state available before the second decision cutoff. The current raw test outcome is not copied into `pre_decision_features`; it only becomes usable as aggregate history after it has been persisted.

The export command includes missing outcomes so the second content event can also be checked in JSONL. A valid run should usually export two observations: the first content event with outcome and the second content event without a later outcome.

## Current Known Limitation

This is still not a browser/live-LLM E2E. It proves the API/DB evidence path and six-factor metadata/export path under controlled flags, not real educational effect.
