# Prediction Layer

Prediction implementation:
- `src/lib/prediction.ts`
- `src/lib/prediction-runtime.ts`
- `src/lib/prediction-contract.ts`
- `src/lib/prediction-feature-layer.ts`
- `src/lib/prediction-ml.ts`
- `src/lib/personalization-runtime.ts`
- `src/lib/evaluation.ts`
- `src/lib/prediction-duration.ts`
- `src/lib/prediction-backtest.ts`
- `src/lib/prediction-calibration.ts`
- `src/lib/prediction-params.ts`
- `src/app/api/users/me/predictions/route.ts`
- submit-time logging in `src/app/api/tests/[id]/submit/route.ts`

## Research Contract

The prediction layer exists to infer effective preference, not merely to echo declared preference.

Core distinction:
- declared preference = what the learner says they prefer;
- effective preference = what leads to the best measurable learning result.

Current dissertation ML focus:
- `difficulty`;
- `explanation depth`.

Optional future ML axis:
- `instructional_mode`.

Tone, style, and formatting are not current dissertation ML targets.
They belong to the rule-based rendering layer described in `docs/ARCHITECTURE.md`.

## Current Runtime Decision Alignment

The current runtime now exposes an explicit two-step contract:
- decision layer output: `difficulty` and `depth`;
- rendering/materialization output: tone, explanation style, and response format.

Current implementation detail:
- `src/lib/personalization-runtime.ts` evaluates candidate `difficulty` values by calling the active runtime backend for `expectedAccuracy`;
- it then selects `depth` through an explicit, labeled heuristic or stub rule, depending on backend state;
- routes such as `POST /api/tests/generate` and `POST /api/chat` consume the materialized rendering output instead of mixing wide axis presets directly into core decision logic.

Compatibility note:
- legacy `uxPreset`, `pedagogyPreset`, and delivery payload fields still exist for route/storage compatibility;
- they now act as adapters over the narrower pedagogical decision contract rather than as the canonical decision space.

## Definition Of Optimal Content

Conceptual objective:
- optimal educational content = content that maximizes learning gain.

Current practical baseline proxy:
- next-task success probability.

Secondary support metric:
- expected time or duration may be used as a constraint, efficiency signal, or audit metric;
- it is not the primary educational objective.

## Current Runtime Boundary

The current repository contains prediction-runtime machinery for operational support signals such as:
- `expectedAccuracy`;
- `expectedTotalDurationMs`.

These outputs are useful for monitoring, calibration, and baseline comparisons.
They do not replace the pedagogical target definition above.

Current runtime modes may include:
- heuristic baselines;
- stub model paths;
- artifact-backed ML paths.

Honesty rule:
- heuristic or stub outputs must never be presented as ML;
- if a trained artifact is absent or invalid, runtime must report that state explicitly;
- no hidden heuristic substitution is allowed for an unavailable ML slot.
- if `depth` is selected by a rule over backend support signals rather than by a trained artifact, that source must remain labeled as heuristic or stub.

## Policy And Versioning

Prediction policies must remain versioned and comparable.
Current runtime configuration is selected via:
- `configs/active_policy.json`

Current runtime contract carries explicit metadata such as:
- `runtimePolicyId`;
- backend kind and backend id;
- source type (`heuristic`, `stub`, `ml_artifact`);
- artifact state snapshot when relevant.

This versioning requirement applies both to:
- current heuristic or stub baselines;
- future dissertation ML policies for `difficulty` and `depth`.

## Replay-Safe Feature Rules

Feature construction must use only information available before the current prediction decision.

Required constraints:
- no future leakage;
- no UI-side core prediction logic;
- no hidden fallback behavior;
- shared, auditable feature definitions between offline evaluation and runtime;
- explicit distinction between support metrics and pedagogical decision targets.

Current feature payload builder:
- `src/lib/prediction-feature-layer.ts`

Current shared feature schema used by the accuracy artifact path:
- `accuracy_ml_features_v1`

## Runtime Backends

### Heuristic baseline backend

Supported comparison policies include:
- `v1_accuracy_raw_duration_baseline`
- `v2_accuracy_beta_duration_unified`

These are explicit heuristic baselines.
They are useful for comparison and fallback behavior, but they are not ML.

### Stub model backend

This path exercises the runtime contract with hardcoded placeholder coefficients.
It exists to validate the model slot honestly before a trained artifact is mandatory.
It is not ML.

### Artifact-backed ML backend

This path loads an offline JSON artifact and evaluates a shared feature vector.
Current repository support is focused on operational outcome prediction artifacts.
Future dissertation-policy artifacts for `difficulty` and `depth` must follow the same honesty, versioning, and replay constraints.

Artifact slot states are explicit:
- `ready`
- `missing`
- `invalid`

If the artifact is not `ready`, runtime must expose that state rather than silently substituting another backend.

## Current Artifact Path

Default local artifact path:
- `configs/ml_accuracy_logreg_artifact.local.json`

Repository state note:
- this file is a local/generated artifact path and is ignored by `.gitignore`;
- if it is absent, `configs/active_policy.json` must remain on an explicit safe fallback instead of pretending that prediction ML-first is ready;
- `npm run prediction-runtime:self-check` is the production gate for this slot and fails when active policy is not `artifact_ml`, the artifact is missing/invalid, or runtime does not return `sourceType=ml_artifact` for `expectedAccuracy`.
- the ML-first gate also rejects synthetic artifacts, artifacts trained with `eligibleOnly=false`, artifacts trained with `consentOnly=false`, and artifacts with an insufficient chronological train/eval split.

Current artifact-backed implementation in the repository:
- offline logistic regression for `expectedAccuracy`;
- auditable JSON artifact;
- no external serving layer.

Offline commands:
- `npm run ml-accuracy:train`
- `npm run ml-accuracy:eval`
- `npm run ml-accuracy:self-check`
- `npm run prediction-runtime:self-check`
- `npm run prediction-runtime:dev-self-check`

Create a runtime-eligible artifact from the application DB:

```bash
DATABASE_URL="<runtime db>" DIRECT_URL="<direct db>" npm run ml-accuracy:train
```

By default this uses:
- `eligibleOnly=true`;
- `consentOnly=true`;
- a chronological split requiring at least 12 train rows and 4 eval rows;
- output path `configs/ml_accuracy_logreg_artifact.local.json` unless `EDUAI_ML_ARTIFACT_PATH` is set.

If the default training command reports `insufficient_data`, do not switch `configs/active_policy.json` to `artifact_ml`.
Unfiltered training with `EDUAI_ML_ELIGIBLE_ONLY=false` or `EDUAI_ML_CONSENT_ONLY=false` can be useful only as a local diagnostic and must not be used for the ML-first runtime gate.

Synthetic artifact generation is supported only by `npm run ml-accuracy:self-check` and temporary/dev probes.
Synthetic artifacts are non-production and are intentionally rejected by `npm run prediction-runtime:self-check`.

### Forced DEV artifact runtime

The repository may use a forced DEV artifact to exercise the full `artifact_ml`
runtime path without claiming production readiness or research evidence.

Generate the tracked DEV artifact:

```bash
EDUAI_ML_SOURCE=synthetic \
EDUAI_ML_ARTIFACT_PATH=configs/ml_accuracy_logreg_artifact.dev.json \
npm run ml-accuracy:train
```

Use this active policy only for local/dev pipeline verification:

```json
{
  "version": "prediction_runtime_config_v1_2026_03",
  "policyId": "prediction_runtime_v1_2026_03",
  "backend": {
    "kind": "artifact_ml",
    "artifactPath": "configs/ml_accuracy_logreg_artifact.dev.json"
  }
}
```

Then run:

```bash
npm run prediction-runtime:dev-self-check
```

Expected DEV result:
- active backend is `artifact_ml`;
- `expectedAccuracy.metadata.sourceType` is `ml_artifact`;
- artifact status is `ready`;
- `productionEligible=false`;
- `researchEvidence=false`.

The strict production gate remains:

```bash
npm run prediction-runtime:self-check
```

For the synthetic DEV artifact this strict gate must fail with
`synthetic_artifact_not_ml_first_eligible`. That failure is intentional.
Synthetic, unfiltered DB, or otherwise non-eligible artifacts can verify runtime
wiring, but they are not evidence that the model improves learning outcomes.

After a valid eligible+consent artifact exists, switch the active policy:

```json
{
  "version": "prediction_runtime_config_v1_2026_03",
  "policyId": "prediction_runtime_v1_2026_03",
  "backend": {
    "kind": "artifact_ml",
    "artifactPath": "configs/ml_accuracy_logreg_artifact.local.json"
  }
}
```

Then run:

```bash
npm run prediction-runtime:self-check
```

Rollback to the explicit fallback:

```json
{
  "version": "prediction_runtime_config_v1_2026_03",
  "policyId": "prediction_runtime_v1_2026_03",
  "backend": {
    "kind": "heuristic_baseline",
    "heuristicPolicyId": "v2_accuracy_beta_duration_unified"
  }
}
```

Production deployment note:
- `configs/*.local.json` is ignored and will not be deployed from Git by default;
- either deploy the generated artifact through a secure build/deploy step, or store a reviewed non-local artifact path in the repository and point `backend.artifactPath` to that tracked file;
- do not commit raw user data or private dataset exports.

Research/demo wording:
- allowed only after the runtime self-check passes with a runtime-eligible artifact: "trained model selected expected accuracy";
- allowed for forced local/dev pipeline validation only: "DEV ML-first runtime";
- allowed with a scope qualifier while six-factor remains a separate artifact-backed path: "ML-first personalization runtime";
- not allowed for synthetic-only or unfiltered artifacts: "production ML-first accuracy runtime";
- not allowed for the forced DEV artifact: "production-ready trained model selected expected accuracy".

These commands document the current operational ML slot.
They do not by themselves mean the full dissertation prediction layer is complete.

## Operational Support Signals

Current operational runtime outputs remain:
- `expectedAccuracy`;
- `expectedTotalDurationMs`.

Interpretation rule:
- `expectedAccuracy` is the closest current operational approximation to the next-task success baseline proxy;
- `expectedTotalDurationMs` is a secondary operational signal;
- neither output should be described as the full pedagogical policy by itself.

## Logging, Backtesting, And Calibration

Submit-time logging writes predicted versus actual outcome metadata into:
- `TestAttempt.byTagJson._meta.prediction`

Backtesting and calibration are implemented in:
- `src/lib/prediction-backtest.ts`
- `src/lib/prediction-calibration.ts`
- `GET /api/admin/prediction-backtest`
- `GET /api/admin/prediction-calibration`

Replay rule:
- for attempt `i`, prediction must be computed only from history with index `< i`.

Comparison requirement:
- heuristic baselines, declared-preference baselines, and ML policies must be distinguishable and comparable in evaluation artifacts;
- no document or UI should imply that a heuristic baseline is already an ML policy.

## Evaluation Provenance Support

The runtime now stores compact evaluation provenance alongside prediction/runtime metadata.

Current support includes:
- an explicit evaluation episode record that can link pre-check, content delivery, post-check, and delayed re-check touchpoints;
- policy-arm assignment metadata so baseline heuristic, self-report-driven, predicted-personalized, manual override, and observational modes remain distinguishable;
- item-role and item-variant metadata so future analysis can separate training items, direct repeats, isomorphic same-skill checks, unseen holdouts, and delayed holdouts;
- topic, concept, and skill linkage so prediction outcomes can later be compared within a meaningful instructional scope.

Primary storage surfaces:
- `GeneratedTest.validationMetaJson.evaluation`
- `TestAttempt.byTagJson._meta.evaluation`
- `ChatMessage.signalsJson.evaluationSignal`

Interpretation rule:
- tests are the primary signal for learning evaluation;
- chat remains a secondary support signal and must not be treated as an equal measure of learning gain;
- adding evaluation provenance does not itself claim that effectiveness has already been proven.

## Practical Interpretation

Use this document with `docs/AXIS_SCHEMA_V2.md` and `docs/LEARNING_POLICY_V2.md`:
- `docs/AXIS_SCHEMA_V2.md` explains which axes are taxonomy, constraints, or rendering decisions;
- `docs/LEARNING_POLICY_V2.md` records the current heuristic baseline logic;
- this document defines the research prediction contract and the honesty rules for all runtime modes.
