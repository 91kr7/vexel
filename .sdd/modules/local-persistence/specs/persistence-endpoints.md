---
module: local-persistence
component: Persistence endpoints
type: REST endpoint
---

# Persistence endpoints

**Purpose** → exposes preferences and analysis-cache usage/clear to the client.

## Contract

- `GET /api/persistence/preferences` → `200`, the stored `OperatorPreferences` (server defaults for
  any field never written).
- `PUT /api/persistence/preferences` → request body: a partial `OperatorPreferences`; merged onto
  the currently stored preferences (missing fields keep their stored value) and persisted.
  `200` with the merged, persisted `OperatorPreferences`.
- `GET /api/persistence/analysis-cache` → `200`, `{ totalSizeBytes: number }`.
- `POST /api/persistence/analysis-cache/clear` → clears the analysis cache; `204`.

## Dependencies

- LocalStore, AnalysisCacheStore

## Requirements served

- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
