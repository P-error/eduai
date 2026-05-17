# ML Six-Factor App Shadow Integration

## Purpose

This document describes the app-side six-factor policy adapter.
The runtime can serve a valid JSON artifact, but current artifacts are still bootstrap/synthetic-oriented and are not proof of real educational effect.

Target flow:

```text
app context/features -> ML policy adapter -> six-factor config -> prompt/render policy -> content/test/chat -> outcome logging
```

The app-facing contract returns all six factors:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

The internal ML layer may later keep using the candidate outcome scorer shape:

```text
pre_decision_features + candidate_config -> predicted_outcome
```

The app should not depend on that internal scorer detail. The app receives a six-factor decision package.

## Correctness Check

The current prediction runtime still mainly owns `difficulty` and `depth`.
The six-factor TypeScript layer bridges this gap with explicit provenance:

- features are built only from pre-decision app context;
- outcome fields such as `postScore`, `nextStepSuccess`, and `normalizedLearningGain` are not included;
- `response_format=mcq` is not treated as six-factor `presentation_format`;
- fallback/bridge decisions are explicitly marked as fallback or heuristic;
- learner-facing application is explicit through `EDUAI_SIX_FACTOR_APPLY` and `appliedToLearnerFacingOutput`.

## Files

- `src/lib/ml-six-factor-policy-contract.ts`: app-facing feature and decision types plus validation helpers.
- `src/lib/ml-six-factor-feature-builder.ts`: inference-safe feature builder from partial app context.
- `src/lib/ml-six-factor-fallback.ts`: static and current-two-factor bridge fallbacks.
- `src/lib/ml-six-factor-render-mapping.ts`: six-factor prompt/render instruction mapping.
- `src/lib/ml-six-factor-shadow.ts`: explicit shadow adapter and metadata helper.

## Feature Availability

Available or safe today:

- `userRef` from authenticated user id;
- `subjectRef` where a subject-scoped test/content path exists;
- `topicRef` partially from `topicId`, `conceptKey`, `skillKey`, `familyKey`, or topic text;
- recent correctness and time-since-last-attempt where the current recommendation runtime has historical signals;
- declared difficulty/depth from declared preferences where present;
- previous/current `difficulty` and `depth` from the existing runtime decision.

Partial or missing:

- canonical topic/session position is not consistently available on every route;
- full six-factor delivered history is not available until this metadata is logged and exported;
- declared `presentation_format` is not the same as current test `response_format=mcq`.

## Prompt/Render Mapping

The render mapping produces instructions for all six factors:

- `difficulty`: challenge level.
- `depth`: explanation detail.
- `support_level`: hint/scaffolding intensity.
- `presentation_format`: explanation structure for chat/content/feedback.
- `examples_level`: example density.
- `terminology_level`: terminology density.

For test generation, `presentation_format` does not change the technical test output contract.
The technical response format remains `mcq`.

## Shadow Mode

Shadow metadata is enabled by default unless explicitly disabled.
For production examples it is set explicitly with:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
```

When enabled, the adapter builds six-factor metadata for safe logging:

- `candidateConfig`
- `deliveredConfig`
- decision provenance
- fallback/model markers
- leakage guard

It does not apply the six-factor prompt instructions to learner-facing output.
`appliedToLearnerFacingOutput` stays `false`.

## Apply Mode

Apply mode is a separate explicit gate and is default-on unless explicitly disabled:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_APPLY=1
```

Apply mode does not enable ML by itself.
ML selection still requires:

```bash
EDUAI_SIX_FACTOR_ML_POLICY=1
```

Learner-facing application paths include:

- `src/lib/learning-content-generation.ts`
- `src/lib/test-generation.ts`
- `src/app/api/chat/route.ts`

With apply enabled, the six-factor decision is converted into prompt instructions through `src/lib/ml-six-factor-render-mapping.ts`.
The instructions are appended to the learning-content LLM prompt as a separate internal block and cover:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

Metadata records `appliedToLearnerFacingOutput=true`, `appliedPromptInstructionCount=6`, and `appliedPath=learning_content`.

If `EDUAI_SIX_FACTOR_APPLY` is off or `EDUAI_SIX_FACTOR_SHADOW_ONLY=1`, learner-facing content remains unchanged.
If `EDUAI_SIX_FACTOR_SHADOW` is off, apply mode is ignored and the old behavior is preserved.

## Regression Guarantees

`npm run ml-six-factor:self-check` checks both flag modes:

- with `EDUAI_SIX_FACTOR_SHADOW=0`, optional shadow metadata is `null`;
- with flag off, logged payloads omit `sixFactorShadow`;
- with `EDUAI_SIX_FACTOR_SHADOW=1`, logged payloads may include only `sixFactorShadow` metadata;
- `candidateConfig` and `deliveredConfig` contain all six factors when metadata is present;
- learner-facing prompt and output strings are not changed by the shadow helper;
- six-factor prompt instructions are not applied by shadow mode;
- technical test `response_format` remains `mcq`;
- `appliedToLearnerFacingOutput` remains `false`.

## ML Policy Metadata Mode

Shadow metadata can optionally use the runtime artifact adapter when both flags are enabled:

```bash
EDUAI_SIX_FACTOR_SHADOW=1
EDUAI_SIX_FACTOR_ML_POLICY=1
```

The adapter keeps the public app contract as:

```text
app features -> six-factor decision
```

Internally, the current JSON artifact is a candidate outcome scorer:

```text
pre-decision features + candidate_config -> predicted outcome
```

In ML metadata mode the adapter loads the artifact, generates a bounded six-factor candidate set, scores candidates, selects the highest predicted combined score, and records the selected six-factor decision in metadata.

If `EDUAI_SIX_FACTOR_ML_POLICY` is off, or the artifact is missing, invalid, or fails scoring, the metadata uses the heuristic/static six-factor fallback and records warnings.

In shadow-only mode this still does not apply six-factor render instructions to learner-facing prompts or outputs.
`appliedToLearnerFacingOutput` remains `false`.

## Route/Content Regression Guarantees

The current content-path regression is implemented in `scripts/ml-six-factor-shadow-self-check.sh`.
It checks the same conditional metadata pattern used by:

- `src/app/api/chat/route.ts` event metadata;
- `src/lib/test-generation.ts` validation metadata;
- `src/lib/learning-content-generation.ts` assistant message signals.

For one fixed mock learner input, the self-check compares learner-facing fields across:

- shadow off, ML off;
- shadow on, ML off;
- shadow on, ML on with valid artifact;
- shadow on, ML on with missing artifact.

The learner-facing prompt, output, content, and technical test `response_format=mcq` must remain identical.
The only allowed difference is `sixFactorShadow` inside metadata.

This regression exists before any future apply flag because metadata collection must be proven isolated from rendering.

The self-check now also covers apply modes.
In those modes chat, test-generation, and learning-content prompts may receive the six-factor instruction block.
The test response format must stay `mcq`.

## Next Integration Step

The next step is delivered-config logging plus outcome linking/export, so applied six-factor decisions can be compared against later learning outcomes.
