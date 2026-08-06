---
module: containers
component: Container processes endpoint
type: REST endpoint
---

# Container processes endpoint

**Purpose** → exposes the container's process listing to the client.

## Contract

- `GET /api/containers/:id/processes` → `200`
  - body: `{ titles: string[], processes: [{ pid, user, command, cpuPercent?, memoryPercent? }] }`
  - `4xx`/`5xx` → `{ error }` carrying the daemon's own message (e.g. the container is not running,
    or does not exist), with the daemon's status code when it reported one.

## Dependencies

- ContainerProcessesService

## Requirements served

- plan-docker_management_app/REQ-33
