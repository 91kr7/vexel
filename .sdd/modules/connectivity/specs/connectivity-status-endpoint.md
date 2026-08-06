---
module: connectivity
component: GET /api/connectivity/status
type: REST endpoint
---

# GET /api/connectivity/status

**Purpose** → exposes `ConnectionStatusService.getConnectionStatus()` to the client.

## Contract

- `GET /api/connectivity/status` → `200` with the `ConnectionStatus` JSON body (see
  `connection-status-service.md`).

## Dependencies

- ConnectionStatusService

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
