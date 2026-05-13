# EduAI Native Synthetic Training Workspace

## Preflight Review

- Task framing is correct for a first internal EduAI-native bridge stage:
  synthetic episode generation -> canonical synthetic export -> offline train/eval -> runtime-slot-compatible artifact handoff.
- This workspace is explicitly **synthetic-first** and must not be presented as real-user validation.
- The goal here is pipeline honesty and native-schema training readiness, not proof of real-world personalization efficacy.

## Synthetic-First Limitations

- Synthetic learners are transparent abstractions, not human behavior.
- Learned relationships can reflect the generation logic too strongly.
- Good offline metrics here validate plumbing and artifact handoff, but they do not establish external validity.
- Any policy claim beyond internal bridge readiness still requires later real-user EduAI data.

## Synthetic World Assumptions

- Learners are generated with explicit latent traits:
  `ability/mastery`, skill-specific strengths and weaknesses, sensitivity to `difficulty`, sensitivity to `depth`, learning-rate tendency, retention/transfer tendency, and inconsistency/noise.
- `difficulty` and `depth` have explicit bridge logic effects inside the synthetic world.
  Harder content can overshoot learner state, insufficient depth can reduce later understanding on harder or newer topics, and excessive depth can add cost on already-mastered easy material.
- Synthetic episodes always distinguish:
  `precheck`, `learning_content`, `postcheck`, `holdout`, and `delayed_recheck`.
  These roles do not reuse one identical scoring rule.
- The generator includes bounded probe coverage for two important controlled slices:
  hard-and-novel depth probes and easy-mastered overdepth probes.
  This is internal data collection logic, not learner-facing runtime behavior.

## Scope

- Input: canonical snapshot under `training_datasets/synthetic/<snapshot_id>/`
- Training unit: `learning_content` rows with a next-primary-outcome label
- Target: binary next-task success proxy
- Models compared:
  - `logistic_regression`
  - `hist_gradient_boosting`
- Runtime integration:
  - package an artifact into `artifacts/runtime/eduai_native_pedagogy/current/`
  - keep website serving inactive

## Usage

Setup a local environment if needed:

```bash
cd bootstrap_training/eduai_native_synthetic
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
```

Run the full offline pipeline on the latest synthetic snapshot:

```bash
./scripts/run_full_pipeline.sh
```

Run it on a specific snapshot:

```bash
./scripts/run_full_pipeline.sh --snapshot-dir training_datasets/synthetic/<snapshot_id>
```

Run it without any runtime artifact handoff:

```bash
./scripts/run_full_pipeline.sh \
  --snapshot-dir /absolute/path/to/training_datasets/synthetic/<snapshot_id> \
  --run-id <training_run_id> \
  --skip-runtime-handoff
```

Generate a fresh EduAI-native synthetic world run plus export:

```bash
EDUAI_SYNTHETIC_DISABLE_LLM=1 \
EDUAI_SYNTHETIC_RUN_ID=<generation_run_id> \
bash scripts/eduai-native-synthetic-generate.sh
```

## Outputs

- `bootstrap_training/eduai_native_synthetic/data/generation_runs/<generation_run_id>/`
- `bootstrap_training/eduai_native_synthetic/data/generation_runs/<generation_run_id>/sanity_report.json`
- `bootstrap_training/eduai_native_synthetic/data/generation_runs/<generation_run_id>/sanity_report.md`
- `bootstrap_training/eduai_native_synthetic/data/artifacts/training_runs/<run_id>/`
- `artifacts/runtime/eduai_native_pedagogy/current/artifact.json`
- `artifacts/runtime/eduai_native_pedagogy/current/slot_metadata.json`

Synthetic generation sanity artifacts report:

- coverage by `difficulty` and `depth`,
- learner archetype distribution,
- skill/topic distribution,
- role outcome base rates,
- controlled directional checks,
- whether one decision cell dominates the dataset.

## Honesty Note

This workspace is a synthetic internal bridge stage.
It prepares EduAI-native training and artifact handoff mechanics, but it is not the final dissertation evidence for `difficulty` and `depth` personalization on real learners.
Even a stronger synthetic result here should not be activated in learner-facing runtime until a later explicit activation task.
