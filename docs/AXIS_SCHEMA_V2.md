# Axis Schema v2

Axis schema is defined in `src/lib/tags.ts`.

## UX Axes

- `tone`: `formal` | `friendly` | `direct`
- `explanation_style`: `stepwise` | `concise` | `exploratory`
- `response_format`: `mcq` | `short` | `multipart`

Important runtime constraint:
- test generation/preferences currently enforce `response_format="mcq"` only.
- other values exist in taxonomy but are blocked in current test workflow.

## Pedagogy Axes

- `difficulty_target`: `easy` | `medium` | `hard`
- `cognitive_process`: `recall` | `apply` | `analyze`
- `task_family`: `definition` | `problem_solving` | `comparison`
- `context`: `abstract` | `real_world`

## Not Part of v2 Personalization Axes

- `domain`
- `education_level`
- legacy pre-v2 keys (`style`, `depth`, etc.)

## Compliance Enforcement Scope

Current compliance gate evaluates only UX axes requested in delivery:
- `tone`
- `explanation_style`
- `response_format`

Thresholds (`src/lib/tags.ts`):
- `UX_AVG_THRESHOLD = 0.60`
- `UX_MIN_AXIS_THRESHOLD = 0.50`
- `MAX_RETRIES = 2` (total attempts = `1 + MAX_RETRIES`)

Retry condition in generate pipeline:
- only when requested UX exists,
- compliance failed,
- retry budget remains,
- and tagging source is strictly `llm` (no mixed/fallback retry loop).

Learning eligibility requires:
- `generationSource === "llm"`,
- `taggingSource === "llm"`,
- compliance pass after bounded retries,
- no invalid tagging warnings.
