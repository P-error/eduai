# LLM Prompt Compliance Check

Updated: 2026-05-16

## Purpose

This check validates whether existing prompt snapshots lead to compliant responses under a controlled mock provider or the configured live OpenAI-compatible provider.

It does not train models, change artifacts, change Prisma schema, run migrations, update UI, or enable global flags.

## Inputs

The script uses prompt snapshots from:

- `exports/prompt_audit/chat_first_prompt.json`
- `exports/prompt_audit/test_generation_prompt.json`
- `exports/prompt_audit/learning_content_second_prompt.json`
- `exports/prompt_audit/chat_second_prompt.json`

The script refreshes snapshots before checking them:

```bash
bash scripts/audit-llm-prompts.sh
```

To force the prompt audit through the real artifact-backed six-factor runtime path, run:

```bash
bash scripts/check-llm-prompt-compliance.sh --mock-provider --ml-runtime
```

In this mode the audit expects `decisionSource=ml_policy`, `candidateCount > 1`, `appliedToLearnerFacingOutput=true`, and `fallbackUsed=false`. If the runtime artifact is unavailable, the result records `ML_RUNTIME_FALLBACK` and does not report a clean pass.

## Mock Provider

Run:

```bash
bash scripts/check-llm-prompt-compliance.sh --mock-provider
```

This mode does not call the external LLM. It uses deterministic local responses and validates:

- prompt snapshot structure,
- MCQ/TestSchema compliance,
- learning content JSON contract,
- chat response shape,
- six-factor style signals, including visible guided-support and single-example markers,
- forbidden outcome-field absence,
- hidden metadata non-disclosure,
- strict JSON/MCQ conflict rules.

## Live Provider

Run:

```bash
bash scripts/check-llm-prompt-compliance.sh --live-provider
```

Required environment:

- `OPENAI_API_KEY`

Optional environment:

- `OPENAI_BASE_URL`

For local runs, the wrapper loads server-side LLM variables from project env files in dev precedence order, including `.env.local`, without printing values and without using any `NEXT_PUBLIC_*` key. This avoids stale shell env overriding the local server key during controlled compliance checks.

If the key is unavailable, the script writes `LIVE_PROVIDER_UNAVAILABLE` and returns a partial result instead of failing with an unclear provider error.

## Output

The script writes:

- `exports/llm_prompt_compliance_results.json`

The JSON includes:

- provider mode and provider status,
- `mlRuntimeStatus`,
- `appliedToLearnerFacingOutput`,
- `decisionSource`,
- `candidateCount`,
- `fallbackUsed`,
- `judgeStatus`,
- prompts checked,
- pass/fail per prompt,
- schema validation result,
- six-factor compliance notes,
- leakage/strict-rule violations,
- recommendations.

For `support_level=guided`, compliance expects a visible guided support marker such as `Check:`, `Hint:`, `Mini-question:`, or `Next step:`. For `examples_level=single`, learning-content compliance is structural: one dedicated `One example:` section heading is expected, while normal body text is not rejected merely for containing the word "example". MCQ/TestSchema responses keep the technical schema as the higher-priority contract; support/example signals may only appear inside allowed prompt or explanation fields.

For `learning_content_card`, the compliance check also enforces the runtime contract of 2-4 sections. With `examples_level=single`, the prompt requires a single dedicated `One example:` section heading and no extra example cues elsewhere in the card. For chat prompts that reference an underspecified prior check, a compliant response must not only ask for more context; it must still provide one topic-safe example and one visible guided next step when six-factor apply mode is active.

Generated-test semantic judging is optional. Set `EDUAI_LLM_TEST_JUDGE=1` to enable the extra LLM judge after deterministic validation; if unavailable, deterministic validation remains mandatory and metadata records the judge status.

## Status Meaning

- `LLM_COMPLIANCE_PASS`: all checked prompts and provider responses passed validators.
- `LLM_COMPLIANCE_PARTIAL`: prompt snapshots were checked, but the live provider was unavailable.
- `LLM_COMPLIANCE_FAIL`: at least one schema, leakage, six-factor, provider, or strict-rule validation failed.

## What This Does Not Prove

This is not evidence of real educational effect. It checks prompt-response compliance only:

- no learning-gain claim,
- no A/B tuning claim,
- no model-training claim,
- no proof that a six-factor configuration improves outcomes.

Educational effect still requires outcome-linked evaluation over real or controlled learner data.
