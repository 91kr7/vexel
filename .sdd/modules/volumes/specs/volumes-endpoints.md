---
module: volumes
component: Volumes endpoints
type: REST endpoint
---

# Volumes endpoints

**Purpose** → exposes `VolumesService` to the client.

## Contract

- `GET /api/volumes` → `200`, `VolumeSummary[]` (see `volumes-service.md`).
- `GET /api/volumes/:name/inspect` → `200`, `VolumeInspect`; `404` with `{ error }` for an unknown
  name.
- `POST /api/volumes` → request body `{ name?, driver?, driverOpts?, labels? }`; `201`, the created
  `VolumeSummary`.
- `DELETE /api/volumes/:name` → force-removes the volume; `204`.
- `POST /api/volumes/prune` → `200`, `{ removedNames: string[], reclaimedBytes: number }`.

## Rules and invariants

- Any daemon rejection responds with the daemon's own `statusCode` (falling back to `502`) and `{
  error: message }` carrying the daemon's own message verbatim.

## Dependencies

- VolumesService

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
