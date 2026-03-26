# Documentation Index (v2)

This folder documents the current, implemented state of EduAI.
Only AxisSchema v2 is considered canonical.

## Start Here

### For Commission (methodology and defense)
1. `docs/ARCHITECTURE.md` - system boundaries and dataflows.
2. `docs/AXIS_SCHEMA_V2.md` - personalization axes and compliance scope.
3. `docs/LEARNING_POLICY_V2.md` - exact update formulas and gating.
4. `docs/PREDICTION_LAYER.md` - prediction proxies and confidence logic.
5. `docs/ADMIN_OBSERVABILITY.md` - calibration/data quality metrics.
6. `docs/LIMITATIONS_ETHICS.md` - limitations, privacy, ethics.
7. `docs/REPRODUCIBILITY.md` - defense demo reproducibility checklist.

### For Developer
1. `docs/API_REFERENCE.md` - endpoint contracts.
2. `docs/DATA_MODEL.md` - Prisma entities + JSON contracts.
3. `docs/LOCAL_DEV.md` - local bootstrap (DB/env/scripts).
4. `docs/DEPLOYMENT.md` - GitHub + Vercel deployment workflow and env strategy.
5. `docs/RELEASE_CHECKLIST.md` - pre-release and post-release operational checklist.
6. `docs/UX_INFORMATION_ARCHITECTURE.md` - IA, routes, redirects, UX wording.
7. `docs/GLOSSARY.md` - shared terminology.
8. `docs/ROADMAP.md` - current prioritized next tasks.

## Docs conventions
- User-facing language uses: `Personalized` / `Standard`.
- Internal keys (`policyMode`, `learningEligible`, axis keys) are documented for engineering only.
- Legacy axis schema references are intentionally omitted.
