# UI v2 Safe Preview

## Scope

`New UI` is a front-only preview mode over the existing EduAI runtime. It does not change API routes, Prisma schema, database contracts, ML training/evaluation logic, prediction policy logic, or learner-flow backend contracts.

The default mode is `Classic UI`. If the UI version cannot be read from client storage, the application falls back to `Classic UI`.

## Selection

- UI version values: `classic`, `v2`.
- The switch is rendered in the top shell navigation.
- The selection is persisted in `localStorage` key `eduai.uiVersion` and cookie `eduai_ui_version`.
- The active version is mirrored to `html[data-ui-version="classic" | "v2"]`.

## Implemented v2 Surfaces

- Shell navigation: simplified learner navigation, language switcher, UI toggle, auth actions, admin link when allowed.
- Status panel: compact v2 status block; on mobile it is not ordered before main content.
- `/learn`: isolated v2 learner episode workspace with the same client API functions as classic.
- Personalization summary: v2 card renders six delivered factors when metadata exists and shows a standard-mode fallback when metadata is missing.

## Classic-only Surfaces

These routes remain on their existing classic page implementation in this preview:

- `/topics`
- `/practice`
- `/analytics`
- `/profile`

They still inherit the v2 shell/status when `New UI` is enabled, but their page bodies were not rewritten in this step.

## Research Boundary

The v2 frontend only changes materialization/rendering. It does not claim that the current runtime is fully model-owned. Existing heuristic, fallback, bridge, and artifact-backed behavior remains owned by the current backend contracts.

## Build Risk

Even when `New UI` is disabled, all v2 TypeScript/JSX files are part of the Next.js build. A syntax or type error in v2 can still break production build, so `npm run build` is the required safety check after v2 changes.
