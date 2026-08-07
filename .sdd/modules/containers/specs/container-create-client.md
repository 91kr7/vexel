---
module: containers
component: Container create client
type: frontend data client
---

# Container create client

**Purpose** → typed access to the container creation endpoint: the configuration shapes, and the
call that reports pull progress while it runs.

## Contract

- `createContainer(spec, handlers?) → Promise<ContainerCreateResult>`
  - `spec: ContainerCreateSpec` — the same shape the endpoint accepts.
  - `handlers?` — `onImageResolved(pulled)?`, `onPullStep(step)?`, called as the stream arrives.
  - resolves with `{ id, name, started, imagePulled, warnings }` on success.
  - rejects with an `Error` carrying the daemon's own message when the daemon refuses.
  - rejects with the endpoint's error message, or `Request failed with HTTP <status>`, when the
    request itself fails.
- Exported types: `ContainerCreateSpec`, `ContainerCreateResult`, `ContainerCreateHandlers`,
  `PortBinding`, `MountSpec`, `ContainerCapabilities`.

## Rules and invariants

- The response body is read incrementally, so pull progress is reported while the pull is running,
  not once it is over.
- A stream that ends without a terminal line rejects rather than resolving with nothing.

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
- plan-docker_management_app/REQ-29
