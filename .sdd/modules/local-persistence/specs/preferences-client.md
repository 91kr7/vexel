---
module: local-persistence
component: Preferences client
type: frontend data client
---

# Preferences client

**Purpose** → typed `fetch` wrapper for the persistence endpoints; the only place in the client
that knows their URLs.

## Contract

- `OperatorPreferences`: `{ lastScreenId?: string, selectedContext?: string, listFilters:
  Record<string, unknown>, logFollow: boolean, logTimestamps: boolean }`.
- `DEFAULT_PREFERENCES: OperatorPreferences` — client-side fallback (`listFilters: {}, logFollow:
  true, logTimestamps: false`), used before the server has answered.
- `fetchPreferences(): Promise<OperatorPreferences>` — `GET /api/persistence/preferences`.
- `savePreferences(patch: Partial<OperatorPreferences>): Promise<OperatorPreferences>` — `PUT
  /api/persistence/preferences`; returns the merged, persisted preferences.
- `AnalysisCacheUsage`: `{ totalSizeBytes: number }`.
- `fetchAnalysisCacheUsage(): Promise<AnalysisCacheUsage>` — `GET
  /api/persistence/analysis-cache`.
- `clearAnalysisCache(): Promise<void>` — `POST /api/persistence/analysis-cache/clear`.

## Rules and invariants

- Every function throws on a non-`ok` HTTP response.
- No host-path function lives here. `POST /api/host-paths/validate` is served and validated on the
  server (`host-path-validator.md`); the client had a wrapper for it that nothing ever called.

## Requirements served

- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
