---
module: volumes
component: Volumes client
type: frontend data client
---

# Volumes client

**Purpose** → typed `fetch` wrapper for the volumes endpoints.

## Contract

- `fetchVolumes(): Promise<VolumeSummary[]>` — `GET /api/volumes`.
- `fetchVolumeInspect(name): Promise<VolumeInspect>` — `GET /api/volumes/:name/inspect`.
- `createVolume(input): Promise<VolumeSummary>` — `POST /api/volumes`.
- `removeVolume(name): Promise<void>` — `DELETE /api/volumes/:name`.
- `pruneVolumes(): Promise<VolumePruneResult>` — `POST /api/volumes/prune`.
- Every call rejects with an `Error` carrying the server's own `{ error }` message (falling back to
  a generic HTTP-status message) on a non-`ok` response.

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
