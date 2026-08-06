---
module: containers
component: Containers endpoints
type: REST endpoint
---

# Containers endpoints

**Purpose** → exposes `ContainersService` to the client.

## Contract

- `GET /api/containers` → `200`, `ContainerSummary[]` (see `containers-service.md`).
- `POST /api/containers/:id/start` → `204`.
- `POST /api/containers/:id/stop` → `204`.
- `POST /api/containers/:id/restart` → `204`.
- `POST /api/containers/:id/pause` → `204`.
- `POST /api/containers/:id/unpause` → `204`.
- `POST /api/containers/:id/kill` → `204`.
- `DELETE /api/containers/:id` → force-removes the container; `204`.
- `POST /api/containers/:id/rename` → request body `{ name }`; `400` with `{ error }` when `name` is
  missing or blank; otherwise `204`.
- `POST /api/containers/prune` → `200`, `{ removedCount: number, reclaimedBytes: number }`.
- `GET /api/containers/:id/inspect` → `200`, `ContainerInspect` (see `containers-service.md`).
- `PATCH /api/containers/:id/config` → request body `ContainerConfigUpdate`; `200`,
  `ContainerConfigUpdateResult` (see `containers-service.md`).

## Rules and invariants

- Any daemon rejection (an action on a container whose current state does not allow it, an unknown
  id, …) responds with the daemon's own `statusCode` (falling back to `502`) and `{ error: message
  }` carrying the daemon's own message verbatim.

## Dependencies

- ContainersService

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
