# ML Six-Factor Apply Mode

## Purpose

Apply mode is the first explicit gate that lets a six-factor decision affect learner-facing generation.
It is off by default.

The app-facing contract remains:

```text
app features -> six-factor decision
```

The internal ML scorer, when enabled, remains:

```text
pre-decision features + candidate_config -> predicted outcome
```

## Flags

- `EDUAI_SIX_FACTOR_SHADOW=1`: allows six-factor metadata and decision construction.
- `EDUAI_SIX_FACTOR_ML_POLICY=1`: allows artifact-backed candidate scoring.
- `EDUAI_SIX_FACTOR_APPLY=1`: allows render instructions to be added to eligible learner-facing LLM prompts.
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH`: optional artifact path for ML policy mode.

`EDUAI_SIX_FACTOR_APPLY` requires shadow mode.
It does not enable ML policy by itself.

## Applied Paths

The applied v1 paths are:

- `src/app/api/chat/route.ts`
- `src/lib/learning-content-generation.ts`
- `src/lib/test-generation.ts`
- `src/lib/learning-dialogue.ts`

When enabled, the path appends a separate internal prompt block with all six factors:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

The block is added after the structured package or inside the structured system prompt, depending on the path.
It must preserve the output JSON contract, MCQ contract, dialogue budget, and safety instructions.

Technical test `response_format=mcq` is not replaced by six-factor `presentation_format`.

## Provenance

When apply mode is active, `sixFactorShadow` metadata records:

- `candidateConfig`
- `deliveredConfig`
- `decisionSource`
- `modelVersion`
- `artifactPath`
- `fallbackUsed`
- `warnings`
- `appliedToLearnerFacingOutput=true`
- `appliedPromptInstructionCount=6`
- `appliedPath=chat | learning_content | test_generation`

If the artifact is missing or invalid, the adapter falls back to the explicit heuristic/static six-factor bridge and records warnings.

## Honesty Note

The example artifact is trained on synthetic data.
Apply mode verifies the runtime path and provenance.
It does not prove that the selected six-factor configuration improves real learning outcomes.

## Verification

Run:

```bash
scripts/ml-six-factor-shadow-self-check.sh
```

The self-check verifies:

- no instructions when apply is off;
- chat, test-generation, and learning-content instructions when apply is on;
- all six factors appear in the applied prompt block;
- metadata marks the applied path;
- invalid artifact mode falls back without crashing;
- technical test `response_format=mcq` remains unchanged.

## Next Step

Use prompt snapshots and outcome-linked exports to compare applied decisions against later learner outcomes.
