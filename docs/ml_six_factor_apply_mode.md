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

- `EDUAI_SIX_FACTOR_SHADOW=1`: enables six-factor metadata/logging construction.
- `EDUAI_SIX_FACTOR_ML_POLICY=1`: enables artifact-backed candidate scoring for the six-factor pedagogical decision.
- `EDUAI_SIX_FACTOR_APPLY=1`: applies the selected six-factor profile to learner-facing prompts.
- `EDUAI_SIX_FACTOR_SHADOW_ONLY=1|true|on`: keeps scoring/logging but does not apply the prompt block.
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH`: artifact path for six-factor ML policy mode, separate from `configs/active_policy.json`.

Absence of these flags keeps ML policy, six-factor decision, and apply active.
Setting `EDUAI_SIX_FACTOR_ML_POLICY=0|false|off` uses an explicit heuristic/static fallback; that fallback is not ML evidence.

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

When enabled, the path appends a learner-facing-clean prompt block with all six factors:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

The block is added after the sanitized external task package or inside the structured system prompt, depending on the path.
It must preserve the output JSON contract, MCQ contract, dialogue budget, and safety instructions.
It must not expose raw learner-state aggregates, feature snapshots, feature refs, backend/artifact diagnostics, or internal package/linkage fields.

Technical test `response_format=mcq` is not replaced by six-factor `presentation_format`.

## Primary Decision Path

For new predicted/observational episode and chat paths, the primary pedagogical
decision is now the six-factor decision. The older `{ difficulty, depth }`
object remains only as a derived compatibility projection for existing route,
storage, and UI contracts. It must not be interpreted as the full
personalization decision.

When the six-factor policy is enabled, the app does not use
`getSubjectRecommendation` or `prediction_runtime_v1_2026_03` as the main
pedagogical decision owner for new predicted episode steps. Those paths remain
compatibility/fallback surfaces for explicit opt-out, baseline, self-report, or
legacy reads.

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
Old records that only contain `{ difficulty, depth }` are adapted to a complete
six-factor shape only for read/export compatibility and are marked
`decisionSource=legacy_derived`.

## Learner-facing UI

`NEXT_PUBLIC_SHOW_ML_PERSONALIZATION` controls UI visibility/debug details only.
It does not enable or disable six-factor scoring, selection, or prompt apply.
The `/learn` UI may show a compact primary six-factor summary when canonical delivered metadata exists; the flag is only for expanded/operator-style details.

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
