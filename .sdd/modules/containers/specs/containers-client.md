---
module: containers
component: Containers client
type: frontend data client
---

# Containers client

**Purpose** → typed `fetch` wrapper for the containers endpoints; the only place in the client that
knows their URLs.

## Contract

- `ContainerSummary`, `ContainerPort`, `ContainerState` — mirror the server shapes (see
  `containers-service.md`).
- `fetchContainers(): Promise<ContainerSummary[]>` — `GET /api/containers`.
- `startContainer(id)`, `stopContainer(id)`, `restartContainer(id)`, `pauseContainer(id)`,
  `unpauseContainer(id)`, `killContainer(id)`, `removeContainer(id)`: `Promise<void>`.
- `renameContainer(id, name): Promise<void>`.
- `pruneStoppedContainers(): Promise<PruneResult>` — `PruneResult`: `{ removedCount, reclaimedBytes
  }`.
- `ContainerInspect`, `ContainerConfigUpdate`, `ContainerConfigUpdateResult` and their nested types
  (`RestartPolicy`, `ResourceLimits`, `PortBinding`, `MountInfo`, `NetworkAttachment`,
  `HealthCheckConfig`, `HealthCheckResult`) — mirror the server shapes (see
  `containers-service.md`).
- `fetchContainerInspect(id): Promise<ContainerInspect>` — `GET /api/containers/:id/inspect`.
- `updateContainerConfig(id, update): Promise<ContainerConfigUpdateResult>` — `PATCH
  /api/containers/:id/config`.

## Rules and invariants

- Every function throws an `Error` whose message is the server's `{ error }` body when the response
  is not `ok` (the daemon's own message, per `containers-endpoints.md`), falling back to a generic
  `HTTP <status>` message when the body carries none.

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
