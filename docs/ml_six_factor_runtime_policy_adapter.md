# ML Six-Factor Runtime Policy Adapter

## Purpose

This adapter lets the app resolve an app-facing six-factor decision and apply it to learner-facing prompts by default.

App-facing flow:

```text
app context/features -> six-factor policy adapter -> six-factor decision -> metadata
```

Internal ML scorer flow:

```text
pre-decision features + candidate_config -> predicted outcome
```

The app contract stays `features -> six-factor decision`. Candidate scoring is an internal implementation detail.

For new predicted/observational learning episode and chat flows, this
six-factor decision is the primary pedagogical decision. The legacy
`difficulty/depth` object is still emitted where older contracts need it, but it
is a derived compatibility projection rather than the policy owner.
`configs/active_policy.json` remains only the legacy accuracy/time prediction
runtime config and is marked as a compatibility layer; it must not be treated as
the modern pedagogical decision policy.

## Runtime Flags

- `EDUAI_SIX_FACTOR_SHADOW=1` enables metadata/logging construction for six-factor decisions.
- `EDUAI_SIX_FACTOR_ML_POLICY=1` enables artifact candidate scoring for the six-factor pedagogical decision.
- `EDUAI_SIX_FACTOR_APPLY=1` applies the selected six-factor profile to learner-facing prompts.
- `EDUAI_SIX_FACTOR_SHADOW_ONLY=1|true|on` scores/logs the candidate but does not apply it to learner-facing prompts.
- `EDUAI_SIX_FACTOR_ARTIFACT_PATH` is the JSON artifact path for this primary pedagogical runtime. It is separate from `configs/active_policy.json`. If omitted, the adapter first uses `artifacts/runtime/eduai_native_pedagogy/thu_linear_candidate_scorer_v1/artifact.json`, then the legacy example artifact if present.

If the artifact is missing, invalid, or runtime-incompatible, the app falls back safely and records the fallback reason in warnings.
If `EDUAI_SIX_FACTOR_ML_POLICY=0|false|off`, the app uses the explicit heuristic/static fallback; that fallback is not ML evidence.

## Artifact Adapter

`src/lib/ml-six-factor-artifact-loader.ts` reads a JSON artifact and validates the minimum runtime shape:

- `artifact_kind`
- `model_version`
- `model.model_family`
- `feature_schema`
- `candidate_schema`
- JSON scorer payload and weights

Errors are returned as typed results. They are not thrown through the route path.

## Candidate Scoring

`src/lib/ml-six-factor-candidate-generator.ts` creates a deterministic bounded candidate set that includes:

- static baseline;
- heuristic bridge candidate;
- nearby candidates around the bridge/current decision;
- small exploration candidates;
- no duplicates.

`src/lib/ml-six-factor-runtime-scorer.ts` applies the JSON linear candidate scorer payload to:

```text
EduAIAppPolicyFeaturesV1 + SixFactorCandidateConfigV1
```

It uses only pre-decision feature fields and six-factor candidate config. It does not read outcome, post-score, diagnostic truth, or synthetic outcome labels.

Runtime feature extraction mirrors the Python training feature schema, including learner-state/candidate interaction features such as correct-rate by candidate difficulty/support and unknown/low/high state by risky factor values.

## Candidate Guardrails

`src/lib/ml-six-factor-guardrails.ts` filters unsafe runtime candidates before selection:

- unknown or low-correct learner state cannot select `hard + brief + minimal`;
- unknown or weak state requires at least `guided` support and at least `single` example;
- `examplesLevel=none` requires strong history;
- `terminologyLevel=technical` requires confident topic mastery.

If all candidates are filtered, the adapter scores a safe fallback candidate instead of selecting the highest unsafe scorer output. The decision warnings record how many candidates were filtered and whether the safe fallback candidate was used.

## Fallback Behavior

If ML policy mode is disabled, missing, invalid, or fails scoring, the adapter returns a full six-factor fallback decision.
The decision keeps all six factors, sets `fallbackUsed=true`, and records warnings with the error class.

Legacy records that predate delivered six-factor metadata can be read/exported
through a `legacy_derived` adapter. That adapter preserves stored
`difficulty/depth`, fills the other four factors with explicit bridge values,
and marks the result as fallback/compatibility, not ML.

## Learner-Facing Behavior

By default this path applies six-factor prompt instructions to eligible chat, learning content, dialogue, and test generation prompts. It does not change technical test `response_format=mcq`.
`appliedToLearnerFacingOutput` is `true` unless apply is explicitly disabled or `EDUAI_SIX_FACTOR_SHADOW_ONLY=1`.

## Apply Mode

`src/lib/ml-six-factor-apply.ts` applies by default and supports rollback with:

```bash
EDUAI_SIX_FACTOR_APPLY=0
EDUAI_SIX_FACTOR_SHADOW_ONLY=1
```

Applied paths:

- `src/app/api/chat/route.ts`
- `src/lib/learning-dialogue.ts`
- `src/lib/learning-content-generation.ts`
- `src/lib/test-generation.ts`

When apply mode is active, the app:

```text
app context -> six-factor decision -> render mapping -> prompt instruction block -> LLM content generation
```

The six-factor instruction block includes a compact profile summary and all six factors:

- `difficulty`
- `depth`
- `support_level`
- `presentation_format`
- `examples_level`
- `terminology_level`

It is appended as a learner-facing-clean block after the sanitized external task package or inside the structured chat/dialogue system prompt.
It does not replace safety constraints, the output JSON contract, or the MCQ contract.
It does not expose raw learner-state aggregates, full internal generation packages, feature snapshots, feature refs, backend/artifact diagnostics, or private user/session/content refs.

The technical test response format remains `mcq`; `presentation_format` is not treated as test `response_format`.

Metadata records:

- `appliedToLearnerFacingOutput=true`
- `appliedPromptInstructionCount=6`
- `appliedPath=chat | learning_content | test_generation`

If ML policy is disabled, apply mode uses the explicit heuristic/static six-factor fallback.
If ML policy is enabled and the artifact is valid, apply mode uses the ML-selected six-factor decision.
If the artifact is missing or invalid, the adapter falls back and records warnings.

## Route/Content Regression Guarantees

`scripts/ml-six-factor-shadow-self-check.sh` includes content-path regression checks for the three current metadata integration points:

- `src/app/api/chat/route.ts`: chat event metadata pattern.
- `src/lib/test-generation.ts`: generated test validation metadata pattern.
- `src/lib/learning-content-generation.ts`: learning content message signals pattern.

The check covers metadata and apply modes:

- shadow off, ML off: no `sixFactorShadow` metadata;
- shadow on, ML off: fallback/heuristic six-factor metadata only;
- shadow on, ML on, valid artifact: `ml_policy` metadata with `modelVersion` and `candidateCount`;
- shadow on, ML on, invalid artifact: fallback metadata with artifact warning.
- shadow on, apply on, ML off: eligible prompts receive fallback/heuristic six-factor instructions;
- shadow on, apply on, ML on, valid artifact: eligible prompts receive ML-selected six-factor instructions;
- shadow on, apply on, ML on, invalid artifact: apply mode falls back without crashing.

For metadata-only modes the self-check compares fixed learner-facing prompt/output/content fields across modes.
Only metadata may differ.
For apply modes, chat, test-generation, and learning-content prompts may receive the six-factor instruction block.
The technical test response format remains `mcq`.

This is a direct content-path regression, not a full HTTP route test.
It is intentionally lightweight so the metadata-only contract can be checked without auth, DB, or LLM setup.

## Data Honesty

The current example artifact is trained on synthetic data. It is useful for verifying the runtime scorer path and metadata provenance, but it does not prove real educational effect.
Real-user observations and controlled evaluation are still required before any learner-facing ML policy claim.

## Next Step

Use the delivered-config logging and outcome linking/export to evaluate applied
six-factor decisions against real learning outcomes.
