# Training Dataset Export

## Purpose

EduAI keeps operational learning/evaluation data canonical in PostgreSQL and derives training material from that operational store.
This export path is for future EduAI-native training, not for current runtime serving.

Current explicit non-goal:
- the bootstrap sklearn winner is not directly loaded into website runtime in this stage.

## Phase Separation

Phase roots:
- `training_datasets/synthetic/`
- `training_datasets/real/`

The underlying row schema is the same for both phases.
Separation is driven by `EvaluationEpisode.datasetPhase` and `EvaluationEpisode.datasetOrigin`, not by UI toggles.

## Snapshot Structure

Each export writes a versioned snapshot directory:

```text
training_datasets/<phase>/<snapshot_id>/
  dataset.csv
  schema.json
  metadata.json
  manifest.json
```

Current write format:
- `dataset.csv`

Contract honesty:
- `schema.json` defines the canonical row contract;
- `metadata.json` records filters/counts and the preferred later target format (`parquet`);
- `manifest.json` records file paths plus the future runtime artifact handoff target.

## Row Contract Highlights

Each row is an exported evaluation-episode item with:
- stable pseudonymous learner / episode / step / content references,
- episode phase and origin,
- episode arm / assignment provenance,
- topic / concept / skill / family linkage,
- delivered pedagogical decision (`difficulty`, `depth`),
- sequence role / touchpoint / linkage metadata,
- recorded test outcome fields when the step is a test,
- episode-level helper labels such as `postcheck - precheck` and next-primary-outcome accuracy.

This keeps the export compact while still allowing later learning-gain-oriented feature engineering.

## Export Workflow

CLI workflow:

```bash
npm run training-dataset:export
```

Optional environment variables:
- `EDUAI_TRAINING_DATASET_PHASE=synthetic|real`
- `EDUAI_TRAINING_DATASET_TIME_RANGE_DAYS=<int>`
- `EDUAI_TRAINING_DATASET_MAX_EPISODES=<int>`
- `EDUAI_TRAINING_DATASET_COMPLETED_ONLY=true|false`
- `EDUAI_TRAINING_DATASET_CONSENT_ONLY=true|false`
- `EDUAI_TRAINING_DATASET_OUTPUT_ROOT=<path>`

Default behavior:
- phase defaults to the single explicit constant in code;
- completed episodes are exported by default;
- real-phase export is consent-only by default.

## Consent Withdrawal And Future Training Exclusion

Consent withdrawal is explicit and forward-looking:
- operational history is retained;
- future training/export eligibility is disabled from the withdrawal point onward;
- real-phase consent-only export excludes withdrawn learners;
- non-consent-only export keeps operational rows but marks them with:
  - `consentWithdrawnAtIso`
  - `futureTrainingEligible`
  - `excludedFromFutureTraining`
  - `excludedFromFutureTrainingAtIso`
  - `trainingExclusionReason`

Current exclusion reason used by the learner-facing withdrawal flow:
- `consent_withdrawn`

This pass does not implement full physical erasure/delete-on-withdrawal semantics.

## Future Runtime Artifact Slot

Reserved path:
- `artifacts/runtime/eduai_native_pedagogy/current/`

Purpose:
- later training can hand off a runtime-consumable EduAI-native artifact here;
- the first expected handoff may be a synthetic internal bridge artifact package;
- current runtime does not read from this slot yet;
- serving integration is intentionally deferred until the native artifact contract is finalized.

Slot metadata file:
- `artifacts/runtime/eduai_native_pedagogy/current/slot_metadata.json`
