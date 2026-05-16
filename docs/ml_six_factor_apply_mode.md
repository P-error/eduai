# ML Six-Factor Apply Mode

## Purpose

Apply mode is the first explicit gate that lets a six-factor decision affect learner-facing generation.
It is on by default for the ML/apply runtime path.

The app-facing contract remains:

```text
app features -> six-factor decision
```

The internal ML scorer, when enabled, remains:

```text
pre-decision features + candidate_config -> predicted outcome
```

## Flags

- `EDUAI_SIX_FACTOR_ML_POLICY=0|false|off`: disables artifact-backed candidate scoring and uses legacy fallback.
- `EDUAI_SIX_FACTOR_APPLY=0|false|off`: disables learner-facing prompt application.
- `EDUAI_SIX_FACTOR_SHADOW_ONLY=1|true|on`: keeps ML scoring/logging but does not apply the prompt block.
- `EDUAI_SIX_FACTOR_SHADOW=0|false|off`: disables six-factor metadata construction.
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH`: optional artifact path for ML policy mode.

Absence of these flags keeps ML policy, six-factor decision, and apply active.

The THU scorer runtime copy prepared for local/demo/production shadow or apply is:

```text
artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json
```

The older `artifacts/runtime/eduai_native_pedagogy/current` slot is not used as the THU scorer activation pointer.

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

If the artifact is missing, invalid, or runtime-incompatible, the adapter falls back to the explicit heuristic/static six-factor bridge and records warnings.
If the scorer produces a non-finite score, the adapter also falls back and records a `scoring_error` warning.

## Learner-facing UI

When `NEXT_PUBLIC_SHOW_ML_PERSONALIZATION=1`, `/learn` shows a compact
`ML-персонализация` card for learning-content and assistant dialogue outputs
that have canonical six-factor delivered metadata. The card uses a safe summary
only: selected six-factor config, decision source, fallback flag, artifact
version, backend kind, candidate count, and whether the decision was applied to the learner-facing output.
It does not show raw feature snapshots, warnings, prompt text, or debug JSON.

## Honesty Note

The THU artifact is trained on synthetic data.
Apply mode verifies the runtime path and provenance.
It does not prove that the selected six-factor configuration improves real learning outcomes.

## Verification

Run:

```bash
scripts/ml-six-factor-shadow-self-check.sh
```

The self-check verifies:

- no instructions when apply is explicitly off or shadow-only;
- chat, test-generation, and learning-content instructions by default;
- all six factors appear in the applied prompt block;
- metadata marks the applied path;
- invalid artifact mode falls back without crashing;
- technical test `response_format=mcq` remains unchanged.

## Next Step

Use prompt snapshots and outcome-linked exports to compare applied decisions against later learner outcomes.
