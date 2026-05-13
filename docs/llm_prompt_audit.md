# LLM Prompt Audit

Updated: 2026-05-08

## Scope

This audit covers prompt/message formation for external LLM calls. It does not change ML training, artifacts, Prisma schema, migrations, UI, Vercel settings, or `configs/active_policy.json`.

## Checked Runtime Paths

- `/api/chat` via `src/app/api/chat/route.ts`
- learning content via `src/lib/learning-content-generation.ts`
- test generation via `src/lib/test-generation.ts`
- episode dialogue via `src/lib/learning-dialogue.ts`
- LLM tagger via `src/lib/llm-tagger.ts`
- shared prompt/package builders in `src/lib/episode-generation.ts`
- six-factor prompt mapping/apply modules

## Snapshot Self-Check

Run:

```bash
bash scripts/audit-llm-prompts.sh
```

The script does not call the external LLM. It compiles and runs `scripts/audit-llm-prompts.ts`, then writes ignored snapshots under:

- `exports/prompt_audit/chat_first_prompt.json`
- `exports/prompt_audit/test_generation_prompt.json`
- `exports/prompt_audit/learning_content_second_prompt.json`
- `exports/prompt_audit/chat_second_prompt.json`
- `exports/prompt_audit/prompt_audit_summary.json`

## Assertions

The prompt audit checks that:

- every key prompt has a system instruction or equivalent;
- subject/topic context is present where needed;
- declared preferences are present and separated from effective preferences;
- six-factor instructions appear when `EDUAI_SIX_FACTOR_SHADOW=1` and `EDUAI_SIX_FACTOR_APPLY=1`;
- six-factor instructions do not appear when apply is disabled;
- all six factors are represented when apply is enabled;
- forbidden outcome fields are absent from prompt text;
- test generation preserves strict MCQ/TestSchema output;
- `presentation_format` does not replace technical `response_format=mcq`;
- second prompt after a submitted test includes updated aggregate learner-state fields;
- known contradictory instruction pairs are absent.

## First vs Second Prompt

The first prompt snapshot uses aggregate state with:

- `priorAttemptsCount=0`,
- no correctness rates,
- `recentAttemptsCount=0`,
- `topicSeenCount=0`.

The second prompt snapshot uses updated aggregate state with:

- `priorAttemptsCount=1`,
- `priorCorrectRate=0.75`,
- `recentCorrectRate=0.75`,
- `recentAttemptsCount=1`,
- `topicSeenCount=1`,
- `sessionPosition=2`.

Forbidden raw outcome fields are deliberately injected into the synthetic policy context before feature sanitation, and the audit verifies that they do not reach prompt text.

## Test Generation Result

The test prompt preserves:

- `{ type: "json_object" }` provider response format,
- `TestSchema`,
- `response_format=mcq`,
- `answerIndex`,
- fixed JSON/MCQ constraints.

Six-factor personalization can affect difficulty, depth, support, examples, presentation inside explanation text, and terminology. It cannot rewrite the technical test format.

## Remaining Gaps

- Standalone `/api/chat` can only use a concrete subject when the caller supplies `context.subjectId` or related context.
- The tagger is intentionally not personalized; it receives question prompts and tag schema only.
- Fallback content paths do not call the external LLM and therefore cannot prove LLM compliance, only local fallback behavior.
