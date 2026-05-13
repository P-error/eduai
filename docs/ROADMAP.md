# Roadmap (v2)

Priority order is based on thesis defensibility and data integrity.

1. Align runtime decision contracts with the dissertation ML focus on `difficulty` and `explanation depth`.
2. Train and compare versioned policies against explicit baselines:
   - declared-preference baseline;
   - heuristic baseline;
   - artifact-backed ML policy.
3. Keep the two-layer architecture explicit by moving tone/style/format decisions into auditable rendering policy mappings where needed.
4. Strengthen replay-safe dataset export, backtesting, calibration, and policy comparison artifacts for thesis evidence.
5. Clarify implementation naming where legacy keys still reflect older framing (`explanation_style`, `response_format`, other internal aliases).
6. Add explicit experimental bookkeeping for learner-policy assignment and reproducible evaluation slices.
7. Improve defense artifacts: appendix-ready exports, calibration summaries, and preference-difference evidence.
