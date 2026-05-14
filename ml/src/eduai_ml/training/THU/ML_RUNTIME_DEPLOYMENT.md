# THU ML runtime deployment

## Model

`linear_candidate_scorer_v1_seed_42` is a six-factor candidate scorer for the EduAI pedagogy policy adapter. It scores candidate configs for:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

The runtime path is the existing `POST /api/chat` route through `src/app/api/chat/route.ts`; no separate route is required.

## Artifact

- Training artifact: `ml/src/eduai_ml/training/THU/artifacts/candidate_scorer_linear_user_split_seed42.json`
- Runtime artifact: `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`
- Runtime manifest: `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/runtime_manifest.json`
- Model version: `linear_candidate_scorer_v1_seed_42`
- SHA-256: `7dd4b9978e5ece3b819876d75e1a412c499c8ab6a1e540ac0f18c2ac9d29070e`

The `artifacts/runtime/eduai_native_pedagogy/current` pointer is intentionally unchanged.

## Safe Shadow

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
EDUAI_SIX_FACTOR_APPLY=0
```

Effect: metadata is written with the ML decision, but learner-facing prompts remain unchanged.

## Active Apply

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
EDUAI_SIX_FACTOR_ARTIFACT_PATH=artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
EDUAI_SIX_FACTOR_APPLY=1
```

Effect: the selected six-factor config is converted into prompt instructions for eligible learner-facing generation paths.

## Rollback

Use one variable:

- `EDUAI_SIX_FACTOR_APPLY=0` fully stops learner-facing six-factor prompt application while keeping shadow metadata possible.
- `EDUAI_SIX_FACTOR_ML_POLICY=0` stops artifact-backed ML scoring and leaves only the explicit heuristic/static bridge if shadow/apply remain enabled.

For a full learner-facing rollback from active apply, prefer `EDUAI_SIX_FACTOR_APPLY=0`.

## Metadata To Check

Check stored `signalsJson.sixFactorShadow` and `signalsJson.sixFactorDeliveredConfig`:

- `decisionSource`
- `fallbackUsed`
- `modelVersion`
- `artifactPath`
- `backendKind`
- `candidateConfig`
- `deliveredConfig`
- `appliedToLearnerFacingOutput`
- `appliedPromptInstructionCount`
- `warnings`

Expected safe shadow result:

- `decisionSource=ml_policy`
- `fallbackUsed=false`
- `appliedToLearnerFacingOutput=false`

Expected active apply result:

- `decisionSource=ml_policy`
- `fallbackUsed=false`
- `appliedToLearnerFacingOutput=true`
- `appliedPromptInstructionCount=6`

If the artifact path is missing, invalid, or unreadable, runtime falls back to the explicit heuristic/static bridge and records `fallbackUsed=true` plus an `artifact_error` warning. If scorer output becomes non-finite, runtime falls back and records a `scoring_error` warning.

## Honesty Note

This scorer is trained on synthetic THU observations. It proves that the artifact-backed scoring, route integration, metadata, and apply plumbing work. It does not prove real-user learning efficacy yet.
