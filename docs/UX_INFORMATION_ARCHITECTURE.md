# UX Information Architecture

Current user IA is centered on mental-model sections, not backend terms.

## Sitemap

- `/learn` - active learner-facing episode flow (`precheck -> learning_content -> postcheck -> holdout/completion`)
- `/practice` - quick standalone practice surface that does not replace the episode-first Learn path
- `/tests/[id]` - standalone practice runner inside the `Practice` path
- `/analytics` - learner-facing progress/statistics/recommendation surface
- `/profile` - learner profile split into account/context, declared preferences, accessibility, and system observations
- `/topics` and `/topics/[topicId]` - canonical topic structure + topic detail/subtopic management
- `/demo` - isolated scripted showcase route with simulated learner state, direct-path access only, and no live learner/runtime writes
- `/admin` + `/admin/*` - admin-only observability
- `/admin/episodes` - admin-only researcher/operator episode launch + inspection workflow

## Redirect Map

- `/chat` -> `/learn`
- `/dashboard` -> `/analytics`
- `/insights` -> `/analytics`
- `/progress` -> `/analytics`
- `/subjects` -> `/topics`
- `/subjects/[subjectId]` -> `/topics/[topicId]`
- `/collections/[id]` -> `/topics`
- `/tests/create` -> `/practice`
- `/tests` -> `/practice`

## App Shell

Global shell (`src/app/layout.tsx`):
- top navigation (`Topics`, `Learn`, `Practice`, `Analytics`, `Profile`)
- separate operator entry (`Operator`) only when `user.isAdmin=true`
- page body
- learner status panel (`/api/users/me`, `/api/users/me/predictions`) shown in the shell on mobile and desktop, so critical learner state does not disappear when the desktop side panel is hidden
- `/demo` reuses the same shell structure but swaps auth/status data for an explicit simulated demo state and keeps demo navigation scoped to `/demo?scene=*`

## Page Goals and Primary CTA

### Learn (`/learn`)
- Goal: usable end-to-end learning episode in one route
- CTA: `Start episode`, then step-specific `Send question` / `Submit step` / `Continue`
- Secondary CTA: `Start with explanation` launches a learner-facing `learning_content -> postcheck` path for subject-scoped explanation before assessment without replacing the default precheck-first episode
- Empty state: when no topics exist, show a guided state that sends the learner to `/topics?entry=setup`; direct `/learn` should not degrade into a disabled-only start form
- Learning-content UX: episode guide + visible educational dialogue thread + bounded follow-up turns in the same topic/episode context
- Constraint: `/learn` stays canonical; `/chat` remains only a legacy redirect and does not define learner-facing product semantics
- APIs: `GET /api/subjects`, `GET /api/subjects/[subjectId]/sections`, `POST /api/subjects` (minimal entry), `POST /api/evaluation/episodes`, `GET /api/evaluation/episodes/[id]`, `POST /api/evaluation/episodes/[id]/dialogue`, `POST /api/evaluation/episodes/[id]/next`, `POST /api/tests/[id]/submit`

### Analytics (`/analytics`)
- Goal: make the next learner action clear first, then show progress, predicted readiness, and evidence quality as secondary details
- Primary block: `Next recommended step`, with honest thin-data fallback to a full learning episode
- CTA: `Start learning episode` or `Create quick practice` depending on existing learner data; secondary links stay available for `Practice` and `Topics`
- Empty state: thin-data users are directed to a full learning episode before relying on trend/consistency metrics
- APIs: `GET /api/subjects`, `GET /api/users/me/profile`, `GET /api/users/me/predictions`, `GET /api/users/me/dashboard`

### Practice (`/practice`)
- Goal: quick standalone practice or reinforcement without replacing the full learning episode
- Primary CTA: `Create quick practice`
- Secondary CTA: `Better start a full episode`
- Constraint: Practice remains a secondary standalone test surface; it must not be presented as the main modeling or evidence path when the full learner episode is available
- APIs: `GET /api/subjects`, `GET /api/subjects/[subjectId]/sections`, `GET /api/users/me/predictions`, `POST /api/tests/generate`

### Test Runner (`/tests/[id]`)
- Goal: standalone practice attempt surface, not the primary episode loop
- CTA: `Submit test`, then continue to `/learn`, return to `/practice`, or open `/analytics`
- Evidence summary: first explain what is saved and whether progress can update; prediction-vs-actual, path/adaptive-impact, and tag-level details stay in secondary expandable sections
- Access: server-side owner-gated (`404` for non-owners, redirect to `/login` if unauthenticated)
- Data contract: rendered question payload is sanitized (no answer keys in client props)
- API: `POST /api/tests/[id]/submit`

### Profile (`/profile`)
- Goal: explain declared preferences, interface settings, personalization observations, and account/consent context without mixing them into one block
- Internal learner-facing structure: `Interface settings`, `My preferences`, `Personalization`, `Data and consent`
- Secondary details: confidence, exclusions, data quality, and per-topic evidence summaries stay below the main personalization summary in readable expandable sections; data remains visible and read-only
- Editing contract:
  - `Data and consent` updates basic editable account fields and research consent only
  - `Interface settings` applies browser-persisted UI settings immediately
  - `My preferences` edits declared preferences only
  - `Personalization` remains read-only for inferred/runtime observations
- CTA: `Open Learn`, `Open Practice`
- APIs: `GET /api/users/me`, `PATCH /api/users/me`, `GET /api/users/me/profile`, `GET /api/users/me/preferences`, `PATCH /api/users/me/preferences`, `GET /api/users/me/research-consent`, `PATCH /api/users/me/research-consent`, `GET /api/users/me/predictions`

### Topics (`/topics`)
- Goal: expose canonical topic structure while keeping user-defined topic groups as overlays, not replacements
- CTA: `Create topic`, `Start episode`, `Create topic group`
- Empty state: first-time learners see `Create first topic`; topic groups remain secondary organization
- Dialog panels: topic/group/subtopic rename and destructive confirmation panels support Escape close, initial focus, and focus return to the opening action
- APIs: `GET /api/collections`, `POST /api/collections`, `GET /api/subjects`, `POST /api/subjects`, `GET /api/subjects/[subjectId]/sections`, `POST /api/subjects/[subjectId]/sections`

### Admin (`/admin/*`)
- Goal: dense operational and scientific observability
- APIs: `GET /api/admin/*`, plus `GET /api/subjects` for filters

### Demo (`/demo`)
- Goal: one thesis-facing scripted showcase of declared preferences vs evidence-driven observations
- Access: direct URL only; no entry in normal learner navigation or CTAs
- Runtime contract: no real login required, no live LLM/model calls, no production data mutation
- Controls: `Start demo`, `Pause`, `Next`, `Restart`, `Skip to analytics`

### Research Episodes (`/admin/episodes`)
- Goal: one practical operator workflow for launching episodes, selecting subject/topic context, and inspecting arm/provenance/sequence/export readiness
- CTA: `Launch operator episode`, then `Open current episode in learner flow` or inspect the selected episode inline
- APIs: `GET /api/subjects`, `POST /api/subjects`, `GET /api/subjects/[subjectId]/sections`, `POST /api/subjects/[subjectId]/sections`, `GET /api/evaluation/episodes`, `POST /api/evaluation/episodes`, `GET /api/evaluation/episodes/[id]`

## User Wording vs Technical Terms

- `personalization_on` -> `Personalized`
- `personalization_off` -> `Standard`
- `manual_delivery_override` -> manual custom settings
- `tone` -> `Tone`
- `explanation_style` -> `Explanation style`
- `difficulty_target` -> `Difficulty`

## Separation: User vs Admin

User-facing pages do not expose raw policy internals (e.g., schema version, full validation metadata).
Admin pages expose aggregates and calibration quality, not full raw educational content.
