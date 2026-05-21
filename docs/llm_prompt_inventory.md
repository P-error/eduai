# LLM Prompt Inventory

Updated: 2026-05-19

This inventory covers real runtime paths that send `messages` to the external OpenAI-compatible chat-completions provider through `src/lib/llm/provider.ts`.

## Provider Boundary

- File/function: `src/lib/llm/provider.ts`
- External endpoint: `${OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`
- Supported message roles: `system`, `user`, `assistant`
- Supported technical response format: `{ type: "json_object" }` for JSON paths
- Important rule: all runtime LLM calls go through this provider.

## Chat

- File/function: `src/app/api/chat/route.ts` / `POST`
- Called when: learner posts to `/api/chat`
- LLM: `gpt-4o-mini`, text output
- Messages:
  - `system`: active `chat_system_v1` template rendered with declared/effective preferences, then structured sections from `buildChatSystemPrompt`
  - `user`/`assistant`: trimmed incoming chat history from request
  - `developer`: none
  - assistant examples: none
- Data included:
  - user profile: `personalizationReady`
  - declared preferences: yes, separated from effective preferences
  - effective preferences: yes, separated from declared preferences
  - subject/topic context: optional request `context`, validated subject ownership when `subjectId` is present; falls back to evaluation keys or last learner message
  - chat history: yes, trimmed
  - learner-state aggregates: used before the prompt to select/log six-factor metadata, but not printed as raw prompt fields
  - six-factor config/instructions: learner-facing clean pedagogical profile only when apply is enabled
  - deliveredConfig: logged in metadata when six-factor shadow/apply produces metadata; six-factor delivered config values are present in the apply prompt block
  - output schema: conversational educational text, not JSON
- Data not included:
  - raw test answers
  - raw `TestAttempt` payloads
  - pre-decision forbidden outcome fields (`postScore`, `nextStepSuccess`, `normalizedLearningGain`)
- Flags:
  - `EDUAI_SIX_FACTOR_SHADOW`
  - `EDUAI_SIX_FACTOR_APPLY`
  - `EDUAI_SIX_FACTOR_ML_POLICY`
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- Known risks:
  - standalone chat may not receive a concrete subject unless caller supplies `context`
  - learner chat is a secondary signal, not the primary evaluation signal

## Learning Content

- File/function: `src/lib/learning-content-generation.ts` / `generateLearningContentForEpisode`
- Called when: episode materializes a learning-content chat session
- LLM: `gpt-4o-mini`, JSON output with `{ type: "json_object" }`
- Messages:
  - `system`: active `learning_content_v1` template plus structured profile/schema/safety rules
  - `user`: sanitized external learning-content task package plus optional six-factor pedagogical profile/apply block
  - `developer`: none
  - assistant examples: none
- Data included:
  - user profile: `personalizationReady`
  - declared preferences: yes
  - effective preferences: yes, separated
  - subject/topic learning context: `subjectTitle`, `sectionPath`, `topic`, `conceptKey`, `skillKey`
  - chat history: no, this creates the seed content
  - prior test outcome: summary only (`accuracy`, `questionCount`, `totalDurationMs`) when available
  - learner-state aggregates: used before the prompt to select/log six-factor metadata, but not printed as raw prompt fields
  - six-factor config/instructions: compact pedagogical profile and factor guidance when apply is enabled
  - deliveredConfig: logged in assistant message metadata and reflected as values in the apply prompt block
  - output schema: `learning_content_card`
- Data not included:
  - raw answers
  - hidden outcome target fields
  - training labels
  - internal generation package fields such as `episodeId`, `protocolKey`, `policyId`, linkage, rules-layer, backend, artifact, candidate, feature refs, or raw user/session/content refs
- Flags:
  - `EDUAI_SYNTHETIC_DISABLE_LLM` disables live generation
  - `EDUAI_SIX_FACTOR_SHADOW`
  - `EDUAI_SIX_FACTOR_APPLY`
  - `EDUAI_SIX_FACTOR_ML_POLICY`
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- Known risks:
  - fallback card does not fully reflect LLM prompt strictness
  - `priorTestOutcome` is limited to episode-level summary values, not raw answers

## Test Generation

- File/function: `src/lib/test-generation.ts` / `generateTestForUser`
- Called when: `/api/tests/generate` or episode orchestration creates a test
- LLM: `gpt-4o-mini`, JSON output with `{ type: "json_object" }`
- Messages:
  - `system`: active `test_generation_v1` template plus structured profile/schema/safety rules
  - `user`: sanitized external MCQ task package or ad-hoc generation prompt, retry delivery enforcement if needed, optional six-factor pedagogical profile/apply block
  - `developer`: none
  - assistant examples: none
- Data included:
  - user profile: `personalizationReady`
  - declared preferences: yes
  - effective preferences: yes
  - subject/topic learning context: `subjectTitle`, `sectionPath`, `topic`, `conceptKey`, `skillKey`
  - learner-state aggregates: used before the prompt to select/log six-factor metadata, but not printed as raw prompt fields
  - six-factor config/instructions: compact pedagogical profile and factor guidance when apply is enabled
  - deliveredConfig: logged in validation metadata and reflected as values in the apply prompt block
  - output schema: `TestSchema`, technical `response_format=mcq`
- Data not included:
  - raw answers
  - future outcomes
  - `postScore`, `nextStepSuccess`, `normalizedLearningGain`
  - internal generation package fields such as `episodeId`, `protocolKey`, `policyId`, linkage, rules-layer, backend, artifact, candidate, feature refs, or raw user/session/content refs
- Flags:
  - `EDUAI_SYNTHETIC_DISABLE_LLM` disables live generation
  - `EDUAI_SIX_FACTOR_SHADOW`
  - `EDUAI_SIX_FACTOR_APPLY`
  - `EDUAI_SIX_FACTOR_ML_POLICY`
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- Known risks:
  - tagger may fall back to rule tags if LLM tagging is unavailable
  - personalization may influence wording/explanations, but must not change question count or schema

## Episode Dialogue

- File/function: `src/lib/learning-dialogue.ts` / `appendLearningEpisodeDialogueTurn`
- Called when: learner sends a dialogue turn inside an episode learning-content step
- LLM: `gpt-4o-mini`, text output
- Messages:
  - `system`: active `chat_system_v1` template, current episode guide, remaining dialogue budget, optional six-factor apply block
  - `user`/`assistant`: current episode dialogue thread plus new learner message
  - `developer`: none
  - assistant examples: none
- Data included:
  - user profile and preferences
  - subject/topic from current episode and stored learning-content guide
  - chat history for the episode dialogue
  - six-factor instructions when apply is enabled
  - deliveredConfig in message metadata when six-factor metadata exists
- Data not included:
  - raw test answers
  - raw learner-state aggregate fields
  - forbidden outcome target fields
- Flags:
  - `EDUAI_SYNTHETIC_DISABLE_LLM`
  - `EDUAI_SIX_FACTOR_SHADOW`
  - `EDUAI_SIX_FACTOR_APPLY`
  - `EDUAI_SIX_FACTOR_ML_POLICY`
- Known risks:
  - dialogue is secondary support; it must not become the primary learning signal

## LLM Tagger

- File/function: `src/lib/llm-tagger.ts` / `tagQuestionsWithLLM`
- Called when: generated questions are tagged after test generation, if LLM is available
- LLM: `gpt-4o-mini`, JSON output with `{ type: "json_object" }`
- Messages:
  - `system`: active `tagger_v1` template with allowed axes/tags
  - `user`: JSON list of question prompts only
  - `developer`: none
  - assistant examples: none
- Data included:
  - question prompt text
  - tag axis/tag legend
- Data not included:
  - learner profile
  - learner state
  - raw learner answers
  - six-factor decision
- Flags:
  - `EDUAI_SYNTHETIC_DISABLE_LLM`
  - `OPENAI_API_KEY`, `OPENAI_BASE_URL`
- Known risks:
  - not a pedagogical decision prompt; invalid LLM tags fall back to rule tagging

## Non-LLM Prompt/Package Builders

- `src/lib/episode-generation.ts`: builds external test and learning-content prompts from sanitized task packages.
- `src/lib/prompt-materialization.ts`: converts internal generation packages into learner-facing-clean external task packages.
- `src/lib/ml-six-factor-render-mapping.ts`: maps six factors to compact profile summaries, factor guidance, and path-specific constraints.
- `src/lib/ml-six-factor-apply.ts`: appends six-factor prompt blocks when `EDUAI_SIX_FACTOR_APPLY=1` and shadow mode is enabled.
- `src/lib/learning-episode.ts`: orchestrates episode surfaces and calls test/content generation; it does not call the LLM directly.
- `src/lib/evaluation.ts`, `src/lib/recommendation.ts`, `src/lib/personalization-runtime.ts`, `src/lib/prediction-runtime.ts`: decision/evaluation/materialization support; no direct external LLM messages.
