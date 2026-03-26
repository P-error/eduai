# UX Information Architecture

Current user IA is centered on mental-model sections, not backend terms.

## Sitemap

- `/learn` - educational chat (primary learning interaction)
- `/dashboard` - authenticated prediction visibility + mini trends
- `/practice` - generate and run tests
- `/tests/[id]` - test runner + results
- `/progress` - placeholder route for upcoming progress analytics
- `/profile` - personalized profile + confidence
- `/insights` - user-facing adaptation and prediction summary
- `/subjects` and `/subjects/[subjectId]` - subject/section management
- `/collections/[id]` - collection-centered subject view
- `/admin` + `/admin/*` - admin-only observability

## Redirect Map

- `/chat` -> `/learn`
- `/tests/create` -> `/practice`
- `/tests` -> `/practice`

## App Shell

Global shell (`src/app/layout.tsx`):
- top navigation (`Learn`, `Dashboard`, `Practice`, `Profile`, `Insights`, `Admin`)
- page body
- right desktop status panel (`/api/users/me`, `/api/users/me/predictions`)

## Page Goals and Primary CTA

### Learn (`/learn`)
- Goal: low-friction educational conversation
- CTA: send chat message
- APIs: `POST /api/chat`, `GET /api/users/me/profile`

### Dashboard (`/dashboard`)
- Goal: make prediction layer visible to the learner before starting practice
- CTA: `Start practice`
- Empty state: no-attempt users get placeholders and a first-practice CTA
- APIs: `GET /api/subjects`, `GET /api/users/me/profile`, `GET /api/users/me/predictions`, `GET /api/users/me/dashboard`

### Practice (`/practice`)
- Goal: generate personalized or standard test
- CTA: `Start test`
- APIs: `GET /api/subjects`, `GET /api/subjects/[subjectId]/sections`, `GET /api/users/me/predictions`, `POST /api/tests/generate`

### Test Runner (`/tests/[id]`)
- Goal: complete attempt and show transparent result framing
- CTA: `Submit test`, then continue links
- Access: server-side owner-gated (`404` for non-owners, redirect to `/login` if unauthenticated)
- Data contract: rendered question payload is sanitized (no answer keys in client props)
- API: `POST /api/tests/[id]/submit`

### Profile (`/profile`)
- Goal: explain current preferences + confidence + limitations
- CTA: `Practice now`, `Ask in chat`
- APIs: `GET /api/users/me/profile`, `GET /api/users/me/predictions`

### Insights (`/insights`)
- Goal: simplified explanation of adaptation and calibration quality
- CTA: move to practice/learn
- APIs: `GET /api/users/me/predictions`, `GET /api/users/me/prediction-metrics`

### Progress (`/progress`)
- Goal: reserved route for future dedicated progress analytics
- Current state: stub/coming soon page with links back to dashboard/insights

### Admin (`/admin/*`)
- Goal: dense operational and scientific observability
- APIs: `GET /api/admin/*`, plus `GET /api/subjects` for filters

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
