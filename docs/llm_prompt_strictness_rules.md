# LLM Prompt Strictness Rules

Updated: 2026-05-19

## Required Section Order

Runtime prompt builders use this order where the data is available:

1. Role/task
2. Subject/topic context
3. Learner profile and declared/effective preferences
4. Learner evidence summary, when explicitly needed; raw aggregate field dumps are not printed
5. Six-factor personalization policy
6. Content/output requirements
7. Strict output format and conflict resolution
8. Safety and anti-hallucination constraints

## Six-Factor Mapping

Six-factor config is mapped in `src/lib/ml-six-factor-render-mapping.ts`.

| Factor | Prompt effect |
|---|---|
| `difficulty` | Controls challenge level and prerequisite context. `easy` requires basic concepts and concrete wording; `hard` requires transfer/reasoning while still showing needed context. |
| `depth` | Controls explanation length and reasoning detail. `brief` limits explanation to essentials; `detailed` requires intermediate reasoning and common-mistake support. |
| `support_level` | Controls scaffolding. `minimal` gives a hint/cue before full solution; `guided` and `scaffolded` require at least one visible guided support marker such as `Check:`, `Hint:`, `Mini-question:`, or `Next step:` inside the allowed response fields. |
| `presentation_format` | Controls structure inside explanation/chat text only. It must not change JSON keys, MCQ structure, option count, or `answerIndex`. |
| `examples_level` | Controls examples. `none` suppresses extra examples; `single` asks for one short worked illustration when the output format has room; `multiple` allows 2-3 clearly marked examples or one example plus a counterexample. |
| `terminology_level` | Controls terminology. `simple` uses everyday wording and defines required terms; `technical` uses precise terms with first-use definitions. |

Unknown or null factors are normalized by the six-factor contract to safe baseline values before prompt instructions are built.

## Conflict Precedence

1. Safety, factuality, and schema constraints override personalization style.
2. Technical output contracts override `presentation_format`.
3. For tests, `response_format=mcq`, `TestSchema`, option structure, option count, and `answerIndex` are mandatory.
4. Six-factor instructions affect pedagogy, hints, explanations, and wording only.
5. Declared preferences remain self-report; they are not overwritten by effective or inferred preferences.

For `TestSchema`, visible support/example markers may appear only inside allowed prompt or explanation fields and must never add keys. For `learning_content_card`, markers may appear only inside `title`, `summary`, `sections`, or `reflectionPrompt`.

Path-specific constraints:

- Chat: if the learner asks about an underspecified prior check or mistake, the answer may state that exact context is missing, then still gives topic-safe explanation, hint, or a short example when useful.
- Learning content: the card keeps the runtime schema requirement of 2-4 sections. With `examples_level=single`, the structural worked-example requirement is one section heading exactly `One example:`. The validator no longer fails merely because a normal body sentence contains the word "example".
- Test generation: the requested MCQ count and TestSchema remain fixed; support/example wording may shape explanations only.

## Forbidden Prompt Inputs

Pre-decision prompts must not contain:

- raw learner answers,
- raw `TestAttempt` answer payloads,
- future outcome labels,
- post-decision target fields such as post-score, next-step-success, or normalized learning gain,
- hidden training labels,
- full internal generation packages,
- internal-only fields such as `episodeId`, `protocolKey`, `policyId`, `assignmentSource`, `rulesLayer`, `linkedContentId`, `holdoutStrategy`, backend/artifact/candidate diagnostics, feature snapshots, feature refs, or raw user/session/content refs,
- raw learner-state aggregate field dumps such as prior/recent rates, attempt counts, topic counts, recency, or session position.

Raw learner-state aggregates may still be used before generation for six-factor selection and retained in metadata for replay/export. External prompts receive only sanitized educational context, compact pedagogical profile, and strict output constraints.

## Technical MCQ Rule

Six-factor `presentation_format` is not the same as technical `response_format=mcq`.

For test generation:

- `response_format=mcq` remains the technical output contract.
- Personalization may affect difficulty, explanation wording, examples, terminology, and hints.
- Personalization must not change JSON schema, required keys, option count, correct-answer representation, or validation parser expectations.
- New generated tests must pass strict `TestSchema` plus post-parse validation before save: exact requested question count, `answerIndex < options.length`, unique normalized options, no duplicate prompts, non-empty explanations, and no placeholder fallback wording in LLM output.
- Invalid JSON or schema output is repaired once through the shared LLM JSON helper. If deterministic or optional semantic validation still fails after regeneration attempts, the saved fallback is marked `generationSource="fallback"`, `learningEligible=false`, and `learningExcludedReason="FALLBACK_GENERATION"`.

For learning content:

- `learning_content_card` is strict JSON with no extra keys, title/summary/reflectionPrompt non-empty, and 2-4 non-empty sections.
- Runtime validation checks topic anchoring and six-factor markers. `examples_level=single` requires one `sections[].heading === "One example:"`; `support_level=guided` requires a visible guided marker.

## Flags

- `EDUAI_SIX_FACTOR_SHADOW=0`: disables six-factor metadata; default is enabled.
- `EDUAI_SIX_FACTOR_APPLY=0`: disables learner-facing six-factor prompt application; default is enabled when shadow is enabled.
- `EDUAI_SIX_FACTOR_ML_POLICY=0`: disables artifact-backed six-factor decision selection; default is enabled.
- `EDUAI_LLM_TEST_JUDGE=1`: enables optional LLM semantic judge for generated tests after deterministic validation.
- `EDUAI_SYNTHETIC_DISABLE_LLM=1`: disables live LLM generation in supported generation paths.

Default runtime behavior keeps six-factor ML/apply enabled unless explicitly opted out.
