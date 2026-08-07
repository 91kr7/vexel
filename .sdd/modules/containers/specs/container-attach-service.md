---
module: containers
component: ContainerAttachService
type: backend service
---

# ContainerAttachService

**Purpose** → attaches to a running container's own stdio over the Engine API as a duplex session,
detachable without ever stopping the container.

## Contract

- `startAttachSession(id, handlers) → Promise<InteractiveSession>`
  - `handlers: { onData(chunk: Buffer), onExit(exitCode: number | null), onError(message) }`
    - `onData` fires with the container's raw stdio bytes as they arrive.
    - `onExit` fires exactly once, always with `null` (attach has no exit code of its own — the
      container keeps running), when the underlying socket closes.
  - resolves with an `InteractiveSession` (same shape as `ContainerExecService`'s): `write(data)`,
    `resize(cols, rows)`, `close()`.
  - rejects with the daemon's own error when the container cannot be attached to (unknown container,
    not running, unreachable daemon).

## Rules and invariants

- `close()` destroys only the client's side of the hijacked socket; it never issues a stop, kill or
  any other lifecycle request, so the container keeps running after detach.
- A daemon-initiated socket close (the container itself stopping) also resolves the session via
  `onExit(null)`, same as an explicit `close()`.

## Dependencies

- docker-access: EngineClient (via `getEngineClient`)
- ContainerExecService (shares the `InteractiveSession`/handlers shape)

## Requirements served

- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
