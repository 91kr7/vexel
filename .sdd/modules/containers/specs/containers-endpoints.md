---
module: containers
component: Containers endpoints
type: REST endpoint
---

# Containers endpoints

**Purpose** → exposes `ContainersService` to the client.

## Contract

- `GET /api/containers` → `200`, `ContainerSummary[]` (see `containers-service.md`), **answered
  from the refresh cache**.
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
- `GET /api/containers/:id/logs/stream` → the log stream; specified in `container-logs-endpoint.md`.

## Rules and invariants

- **`GET /api/containers` never calls the daemon while the client waits.** It answers the value the
  refresh cache holds (kind `containers`); only a listing never read before — the first request
  after the process started, or the first after a context change — waits for a read. The body is
  unchanged; the response carries `X-Vexel-Read-At`, `X-Vexel-Age-Ms`, and `X-Vexel-Stale` when the
  last read attempt failed.
- **Every route that changes the listing marks that kind changed once it has succeeded**, so the
  operator's own action shows on the next request without waiting for a timer: start, stop, restart,
  pause, unpause, kill, remove, rename, prune, the configuration change, and a creation that reached
  its `created` event. A route that fails marks nothing.
- Inspect, logs, statistics, processes, the sessions and the export/import routes stay **direct**:
  no value is held for any of them.
- `GET /api/containers` answers whatever the sampler has: with no consumer subscribed the summaries
  carry no figures at all, and the endpoint neither starts sampling nor waits for a sample. Reading
  the list is not being a consumer.
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
- plan-docker_management_app-containers_card_view/REQ-41
- plan-docker_management_app-containers_card_view/REQ-55
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-12
- plan-docker_management_app-refresh_cache/REQ-13
