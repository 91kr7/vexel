---
module: local-persistence
component: Preferences client
type: frontend data client
---

# Preferences client

**Purpose** → typed `fetch` wrapper for the persistence and host-path endpoints; the only place in
the client that knows their URLs.

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
- `HostPathValidationRequest`/`HostPathValidationResult` — mirror the server shapes (see
  `host-path-validator.md`).
- `validateHostPath(request): Promise<HostPathValidationResult>` — `POST
  /api/host-paths/validate`.

## Rules and invariants

- Every function throws on a non-`ok` HTTP response (except `validateHostPath`, whose `200` body
  already carries `valid: false` for a refusal).

## Requirements served

- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
- plan-docker_management_app/REQ-116
