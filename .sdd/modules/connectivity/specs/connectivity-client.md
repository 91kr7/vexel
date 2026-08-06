---
module: connectivity
component: fetchConnectionStatus
type: frontend data client
---

# Connectivity client

**Purpose** → typed client function for `GET /api/connectivity/status`.

## Contract

- `fetchConnectionStatus(): Promise<ConnectionStatus>` — `GET`s the endpoint and returns the parsed
  body; rejects with an `Error` (message includes the HTTP status) on a non-2xx response.

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
