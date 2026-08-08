---
module: networks
component: Networks endpoints
type: REST endpoint
---

# Networks endpoints

**Purpose** → exposes `NetworksService` to the client.

## Contract

- `GET /api/networks` → `200`, `NetworkSummary[]` (see `networks-service.md`).
- `GET /api/networks/:id/inspect` → `200`, `NetworkInspect`; `404` with `{ error }` for an unknown
  id/name.
- `POST /api/networks` → request body `{ name, driver?, subnet?, gateway?, ipRange?, options?,
  labels? }`; `400` with `{ error }` when `name` is missing or blank; `201`, the created
  `NetworkSummary`.
- `DELETE /api/networks/:id` → removes the network; `204`.
- `POST /api/networks/prune` → `200`, `{ removedNames: string[] }`.
- `POST /api/networks/:id/attach` → request body `{ containerId }`; `400` with `{ error }` when
  `containerId` is missing or blank; `200`, the network's updated `NetworkInspect`.
- `POST /api/networks/:id/detach` → request body `{ containerId }`; `400` with `{ error }` when
  `containerId` is missing or blank; `200`, the network's updated `NetworkInspect`.

## Rules and invariants

- Any daemon rejection responds with the daemon's own `statusCode` (falling back to `502`) and `{
  error: message }` carrying the daemon's own message verbatim.

## Dependencies

- NetworksService

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
