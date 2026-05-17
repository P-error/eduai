# Documentation Index

This folder documents EduAI's current six-factor runtime, research framing, operational setup, and legacy baseline references.

Repository code plus current documentation remain the source of truth for implemented behavior. Documents marked as legacy, baseline, or historical reference must not be treated as the current runtime policy by themselves.

## Start Here

### Current research/runtime framing
1. `docs/RESEARCH_SPEC.md` - primary dissertation-facing research framing, six-factor scope, hypotheses, and honesty constraints.
2. `docs/ARCHITECTURE.md` - current six-factor runtime architecture, LLM validation boundary, and episode/evaluation flow.
3. `docs/PREDICTION_LAYER.md` - six-factor candidate-scoring policy contract, defaults, artifacts, guardrails, and fallback behavior.
4. `docs/ml_dataset_contract.md` - six-factor supervised training observation format, signed gain, and leakage rules.
5. `VISION.md` - target-state product direction.

### Current six-factor runtime docs
1. `docs/ml_six_factor_runtime_policy_adapter.md` - app-facing six-factor adapter and candidate-scoring runtime path.
2. `docs/ml_six_factor_apply_mode.md` - default-on learner-facing prompt application and rollback flags.
3. `docs/ml_six_factor_app_shadow_integration.md` - metadata/shadow/app integration notes.
4. `docs/ml_six_factor_e2e_smoke.md` - runtime smoke coverage.
5. `docs/ml_six_factor_pilot_runner.md` - pilot runner behavior.
6. `docs/ml_six_factor_ab_evaluation.md` - simulated/pilot-style six-factor policy comparison notes.

### LLM generation, prompts, and validation
1. `docs/llm_prompt_inventory.md` - runtime paths that send messages to the external LLM.
2. `docs/llm_prompt_strictness_rules.md` - prompt section order, schema precedence, six-factor mapping, repair/fallback rules.
3. `docs/llm_prompt_audit.md` - prompt snapshot audit.
4. `docs/llm_prompt_compliance_check.md` - mock/live provider compliance checks.

### For commission / methodology and defense
1. `docs/RESEARCH_SPEC.md`
2. `docs/ARCHITECTURE.md`
3. `docs/PREDICTION_LAYER.md`
4. `docs/DATA_MODEL.md`
5. `docs/LIMITATIONS_ETHICS.md`
6. `docs/REPRODUCIBILITY.md`
7. `docs/ADMIN_OBSERVABILITY.md`
8. `docs/ml_dataset_contract.md`

### For developers
1. `docs/API_REFERENCE.md` - endpoint contracts.
2. `docs/DATA_MODEL.md` - Prisma entities + JSON contracts.
3. `docs/LOCAL_DEV.md` - local bootstrap, DB/env/scripts, six-factor runtime artifact path.
4. `docs/DEPLOYMENT.md` - GitHub + Vercel deployment workflow and env strategy.
5. `docs/RELEASE_CHECKLIST.md` - pre-release and post-release operational checklist.
6. `docs/UX_INFORMATION_ARCHITECTURE.md` - IA, routes, redirects, UX wording.
7. `docs/GLOSSARY.md` - shared terminology.
8. `docs/ROADMAP.md` - current prioritized next tasks.
9. `docs/repository_map.md` - repository structure and risky paths.
10. `docs/artifact_inventory.md` - generated artifacts, canonical examples, and archive policy.
11. `docs/cleanup_policy.md` - cleanup destinations and pre-move checks.
12. `docs/repository_cleanup_report.md` - latest repository cleanup findings.
13. `docs/browser_live_user_journey_pilot.md` - browser/live learner-journey pilot harness and PASS/PARTIAL/FAIL interpretation.
14. `docs/full_user_journey_e2e.md` - full journey e2e harness notes.

### Legacy / baseline / historical reference
1. `docs/LEARNING_POLICY_V2.md` - legacy heuristic baseline policy; useful for comparison, not the current six-factor ML policy.
2. Older two-factor prediction language in historical docs or modules - reference only; current runtime policy is six-factor candidate scoring.
3. Operational expected-accuracy/duration prediction docs - support/baseline diagnostics unless explicitly connected to current six-factor policy.

## Documentation conventions

- Current runtime policy = six-factor candidate scoring and prompt application.
- Legacy `difficulty + depth` language = baseline or historical bridge reference unless explicitly updated.
- Declared preference, inferred preference, effective preference, and delivered configuration must remain distinct.
- Heuristic, static, fallback, or synthetic paths must not be described as real-user-validated ML.
- Synthetic artifacts verify runtime compatibility; they do not prove educational effect.
- Tests are the primary learning-evaluation signal; chat/dialogue is secondary support evidence.
- Fallback or invalid generated artifacts must be marked and excluded from learning/training updates.
- User-facing language should avoid exposing raw feature snapshots, candidate configs, internal metadata, or hidden policy details.
- Internal keys such as `decisionSource`, `learningEligible`, `fallbackUsed`, `candidateCount`, and `appliedToLearnerFacingOutput` are engineering/research metadata.
- If documents conflict, prefer the current six-factor runtime docs and code over older two-factor framing.