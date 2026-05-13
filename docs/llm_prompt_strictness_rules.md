# LLM Prompt Strictness Rules

Updated: 2026-05-12

## Required Section Order

Runtime prompt builders use this order where the data is available:

1. Role/task
2. Subject/topic context
3. Learner profile and declared/effective preferences
4. Learner-state aggregates
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
| `examples_level` | Controls examples. `none` suppresses extra examples; `single` requires exactly one visible marker such as `Example:` or `One example:` when the output format has room; `multiple` allows 2-3 clearly marked examples or one example plus a counterexample. |
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

- Chat: if the learner asks about an underspecified prior check or mistake, the answer may state that exact context is missing, but it still includes one topic-safe `Example:` block and one visible `Next step:` or `Hint:` support element when six-factor apply mode is active.
- Learning content: the card keeps the runtime schema requirement of 2-4 sections. With `examples_level=single`, the only example marker is a dedicated section heading `One example:`; other fields must avoid extra example cues.
- Test generation: the requested MCQ count and TestSchema remain fixed; support/example wording may shape explanations only.

## Forbidden Prompt Inputs

Pre-decision prompts must not contain:

- raw learner answers,
- raw `TestAttempt` answer payloads,
- future outcome labels,
- post-decision target fields such as post-score, next-step-success, or normalized learning gain,
- hidden training labels.

Allowed learner-state values are aggregate pre-decision signals, for example:

- `priorAttemptsCount`,
- `priorCorrectRate`,
- `recentCorrectRate`,
- `recentAttemptsCount`,
- `topicSeenCount`,
- `minutesSinceLastActivity`,
- `sessionPosition`.

## Technical MCQ Rule

Six-factor `presentation_format` is not the same as technical `response_format=mcq`.

For test generation:

- `response_format=mcq` remains the technical output contract.
- Personalization may affect difficulty, explanation wording, examples, terminology, and hints.
- Personalization must not change JSON schema, required keys, option count, correct-answer representation, or validation parser expectations.

## Flags

- `EDUAI_SIX_FACTOR_SHADOW=1`: creates six-factor metadata.
- `EDUAI_SIX_FACTOR_APPLY=1`: applies six-factor instructions to learner-facing prompts only when shadow is also enabled.
- `EDUAI_SIX_FACTOR_ML_POLICY=1`: allows artifact-backed six-factor decision selection; otherwise fallback/bridge decisions are used.
- `EDUAI_SYNTHETIC_DISABLE_LLM=1`: disables live LLM generation in supported generation paths.

Default behavior keeps six-factor prompt application disabled.
