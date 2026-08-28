---
module: connectivity
component: GET /api/connectivity/status
type: REST endpoint
---

# GET /api/connectivity/status

**Purpose** → exposes `ConnectionStatusService.getConnectionStatus()` to the client.

## Contract

- `GET /api/connectivity/status` → `200` with the `ConnectionStatus` JSON body (see
  `connection-status-service.md`), **answered from the refresh cache**.

## Rules and invariants

- The endpoint never probes the daemon while the client waits: it answers the value the refresh
  cache holds (kind `connection-status`), and only a status never read before waits for a probe. The
  body is unchanged; the response carries `X-Vexel-Read-At`, `X-Vexel-Age-Ms`, and `X-Vexel-Stale`
  when the last read attempt failed.

## Dependencies

- ConnectionStatusService

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-15
