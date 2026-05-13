# Documentation Index (v2)

This folder documents the current, implemented state of EduAI and the agreed research framing used for further development.
`docs/RESEARCH_SPEC.md` is the primary research framing document for dissertation-related decisions.
`VISION.md` is the target-state product direction.
Repository code plus current up-to-date docs remain the source of truth for current behavior.
Some documents are explicitly marked as baseline or historical reference documents; treat them accordingly.

## Start Here

### Direction
1. `docs/RESEARCH_SPEC.md` - primary dissertation research framing, hypotheses, and ML scope.
2. `VISION.md` - target-state product direction and product boundary.

### For Commission (methodology and defense)
1. `docs/ARCHITECTURE.md` - system framing, boundaries, and two-layer logic.
2. `docs/AXIS_SCHEMA_V2.md` - authoring/tagging taxonomy and axis roles.
3. `docs/PREDICTION_LAYER.md` - research prediction contract, runtime modes, and honesty rules.
4. `docs/LEARNING_POLICY_V2.md` - current heuristic baseline policy and comparison reference.
5. `docs/ADMIN_OBSERVABILITY.md` - calibration/data quality metrics.
6. `docs/LIMITATIONS_ETHICS.md` - limitations, privacy, ethics.
7. `docs/REPRODUCIBILITY.md` - reproducible setup, demo, and evaluation checklist.

### For Developer
1. `docs/API_REFERENCE.md` - endpoint contracts.
2. `docs/DATA_MODEL.md` - Prisma entities + JSON contracts.
3. `docs/LOCAL_DEV.md` - local bootstrap (DB/env/scripts).
4. `docs/DEPLOYMENT.md` - GitHub + Vercel deployment workflow and env strategy.
5. `docs/RELEASE_CHECKLIST.md` - pre-release and post-release operational checklist.
6. `docs/UX_INFORMATION_ARCHITECTURE.md` - IA, routes, redirects, UX wording.
7. `docs/GLOSSARY.md` - shared terminology.
8. `docs/ROADMAP.md` - current prioritized next tasks.
9. `docs/repository_map.md` - repository structure and risky paths.
10. `docs/artifact_inventory.md` - generated artifacts, canonical examples, and archive policy.
11. `docs/cleanup_policy.md` - cleanup destinations and pre-move checks.
12. `docs/repository_cleanup_report.md` - latest repository cleanup findings.
13. `docs/llm_prompt_inventory.md` - real external LLM prompt/message paths.
14. `docs/llm_prompt_strictness_rules.md` - prompt ordering, six-factor mapping, and schema precedence.
15. `docs/llm_prompt_audit.md` - local prompt snapshot audit and assertions.
16. `docs/llm_prompt_compliance_check.md` - controlled mock/live provider compliance checks for prompt snapshots.
17. `docs/browser_live_user_journey_pilot.md` - browser/live learner-journey pilot harness and PASS/PARTIAL/FAIL interpretation.
18. `docs/ml_dataset_contract.md` - six-factor supervised training observation format and leakage rules.

## Docs conventions
- Distinguish declared preference from effective preference.
- Do not describe heuristic, stub, or rule-based layers as ML.
- Do not treat the 10 content axes as equal dissertation ML targets.
- User-facing language uses: `Personalized` / `Standard`.
- Internal keys (`policyMode`, `learningEligible`, axis keys) are documented for engineering only.
- If a document is marked as `baseline`, `legacy`, or `historical reference`, it is not the strategic target-state core by itself.
