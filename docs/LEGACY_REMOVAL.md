# Legacy Removal / Deprecation Log

Date: 2026-02-11

## Scope

This document records safe cleanup decisions for legacy routes/modules.

Classification:
- `delete`: provably unused module with no active imports
- `deprecate`: keep route surface but return explicit `410` to avoid silent breakage
- `keep`: still used in current UI/API flows

## Inventory and Actions

| Item | Evidence | Decision | Replacement |
|---|---|---|---|
| `src/app/api/chat/send/route.ts` | No runtime callers found in `src/`; only docs reference legacy endpoint | `deprecate` | `POST /api/chat` |
| `src/app/api/admin/analytics/route.ts` | Previously used by `src/app/admin/page.tsx` and `src/app/admin/analytics/page.tsx`; now removed from overview fetch path | `deprecate` | `/api/admin/data-quality-metrics`, `/api/admin/personalization-metrics`, `/api/admin/prediction-metrics`, `/api/admin/tests-metrics` |
| `src/lib/admin-analytics.ts` | Legacy aggregator imported only by legacy admin analytics route | `delete` | modern metrics in `src/lib/admin-observability.ts` + `src/lib/prediction-metrics.ts` |
| `src/app/admin/analytics/page.tsx` | Legacy page route existed and called deprecated endpoint | `deprecate` UI | `/admin/data-quality`, `/admin/personalization`, `/admin/predictions`, `/admin/prediction-backtest`, `/admin/prediction-calibration`, `/admin/tests` |
| `/api/admin/prediction-metrics` + `/admin/predictions` | Active references in admin overview and prediction page | `keep` | n/a |
| `/api/admin/prediction-backtest` + `/admin/prediction-backtest` | Active references and docs | `keep` | n/a |
| `/api/admin/prediction-calibration` + `/admin/prediction-calibration` | Active references and docs | `keep` | n/a |

## Deprecated API Response Contract

Deprecated routes return:

```json
{
  "error": "deprecated",
  "replacement": "/api/chat",
  "details": "Use new redacted chat pipeline"
}
```

Notes:
- `replacement` varies per endpoint (`/api/chat` for legacy chat send, admin metrics endpoints for legacy admin analytics).
- HTTP status code is `410 Gone`.

## Safety Checks Applied

1. Removed admin overview dependency on legacy analytics endpoint.
2. Removed navigation link to legacy analytics dashboard.
3. Kept deprecated route handlers explicit (no silent fallback).
4. Deleted only module with no remaining imports (`src/lib/admin-analytics.ts`).
