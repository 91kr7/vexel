---
module: volumes
component: Volumes endpoints
type: REST endpoint
---

# Volumes endpoints

**Purpose** → exposes `VolumesService` to the client.

## Contract

- `GET /api/volumes` → `200`, `VolumeSummary[]` (see `volumes-service.md`), **answered from the
  refresh cache**.
- `GET /api/volumes/:name/inspect` → `200`, `VolumeInspect`; `404` with `{ error }` for an unknown
  name. A direct read of the daemon at the moment it is asked for; `sizeBytes` is the held size, and
  is absent while none is held yet.
- `POST /api/volumes` → request body `{ name?, driver?, driverOpts?, labels? }`; `201`, the created
  `VolumeSummary`.
- `DELETE /api/volumes/:name` → force-removes the volume; `204`.
- `POST /api/volumes/prune` → `200`, `{ removedNames: string[], reclaimedBytes: number }`.

## Rules and invariants

- **`GET /api/volumes` never calls the daemon while the client waits.** It answers the value the
  refresh cache holds (kind `volumes`); only a listing never read before waits for a read. The body
  is unchanged; the response carries `X-Vexel-Read-At`, `X-Vexel-Age-Ms`, and `X-Vexel-Stale` when
  the last read attempt failed. Inspect stays direct.
- **Neither endpoint makes the daemon compute its whole disk usage.** Sizes are joined in from the
  value held under the `volume-sizes` kind, on its own 5-minute schedule; a volume no size is held
  for yet is answered **without** `sizeBytes` rather than awaited, so a volume created a moment ago
  is listed at once.
- Any daemon rejection responds with the daemon's own `statusCode` (falling back to `502`) and `{
  error: message }` carrying the daemon's own message verbatim.

## Dependencies

- VolumesService

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-12
- plan-docker_management_app-refresh_cache/REQ-13
- plan-docker_management_app-refresh_cache/REQ-18
- plan-docker_management_app-refresh_cache/REQ-19
