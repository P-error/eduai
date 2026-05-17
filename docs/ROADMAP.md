# Roadmap

Priority order is based on thesis defensibility, data integrity, and avoiding overclaims.

## Current status

Completed or implemented in the current runtime contour:

1. Six-factor candidate-scoring formulation is implemented as the current app-facing research policy path.
2. Learner-facing six-factor prompt application is enabled by default, with explicit opt-out/fallback flags.
3. Runtime metadata records decision source, fallback state, candidate count, backend/artifact information, and apply status.
4. Signed learning gain is the primary normalized learning-gain target; clamped gain is legacy compatibility.
5. Generated tests and learning content have stricter validation, JSON repair/retry, fallback marking, and learning exclusion for fallback artifacts.
6. Prompt audit/compliance scripts can check the real ML/apply path.

## Highest-priority next tasks

1. Run DB-backed evidence checks with PostgreSQL available.
   - Verify submit route, episode linkage, validation metadata, learning gates, and outcome recording on real DB state.

2. Run controlled live-provider LLM compliance.
   - Use a safe local `OPENAI_API_KEY` context.
   - Run mock-provider checks first.
   - Then run live-provider prompt compliance and inspect JSON/schema/judge behavior.

3. Enable and evaluate optional generated-test semantic judge in controlled runs.
   - `EDUAI_LLM_TEST_JUDGE=1`
   - Confirm judge status is recorded.
   - Confirm judge rejection does not silently mutate answers.

4. Complete one full learner episode path.
   - precheck
   - learning_content
   - optional dialogue
   - postcheck
   - metadata inspection
   - strict export dry run

5. Collect eligible outcome-linked observations.
   - Exclude fallback and generated-invalid artifacts.
   - Keep consent/training eligibility rules visible.
   - Preserve strict pre-decision feature boundaries.

6. Train or select the final runtime-compatible model artifact.
   - Runtime currently supports compatible linear JSON candidate scorer artifacts.
   - Tree/offline models require TypeScript runtime support before deployment.

7. Compare final ML policy against explicit baselines.
   - static/default baseline
   - declared-preference baseline
   - heuristic baseline
   - artifact-backed six-factor ML policy

8. Produce defense-ready evidence artifacts.
   - prompt compliance output
   - sample `validationMetaJson`
   - sample six-factor decision metadata
   - strict export summary
   - model evaluation report
   - baseline comparison report

## Medium-priority cleanup

1. Reduce remaining legacy two-factor language in comments, older docs, and compatibility modules.
2. Mark old heuristic/two-factor documents as baseline or historical where not already marked.
3. Improve developer-facing maps for six-factor modules and scripts.
4. Add human spot-check checklist for generated answer keys.
5. Add clearer production/pilot env examples for judge/live provider checks.

## Not a priority now

- UI redesign beyond showing safe ML personalization metadata.
- Implementing TypeScript tree-model serving unless the chosen final model requires it.
- Expanding the factor space beyond the current six factors.
- Treating chat as a primary learning-gain signal.
- Claiming causal educational effect before outcome-linked evaluation exists.

## Defense interpretation rule

The runtime can show that six-factor ML/apply, validation, metadata, and export contracts work. Educational effectiveness still requires controlled outcome-linked comparison against baselines.