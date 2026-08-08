---
module: compose
component: ComposeLifecycleService
type: backend service
---

# ComposeLifecycleService

**Purpose** → stack lifecycle (up, down, restart) and per-service scaling through the `docker
compose` CLI channel, streaming the command's own output and resolving with the project's resulting
state.

## Contract

- `runComposeUp(name, configFiles, handlers): () => void`
- `runComposeDown(name, configFiles, handlers): () => void`
- `runComposeRestart(name, configFiles, handlers): () => void`
- `scaleComposeService(name, configFiles, service, replicas, handlers): () => void`
  - Scales a single service to `replicas`, leaving the rest of the stack untouched.
  - Every function runs `docker compose -f <file> ... -p <name> <command>` against the project's own
    discovered `configFiles` and returns a cancel function.
  - `ComposeCommandHandlers`: `{ onOutput(line), onResult(project), onError(message) }`.
    - `onOutput` fires once per line of the command's own combined stdout/stderr, in order.
    - Exactly one of `onResult` (with the project re-read through `ComposeDiscoveryService`) or
      `onError` (the daemon's own message) fires once, at the end.
  - Calling the returned cancel function kills the underlying process before it terminates on its
    own; neither `onResult` nor `onError` fires afterwards.

## Dependencies

- compose: ComposeDiscoveryService (`getComposeProject`)
- docker-access: CLI runner (`runCliCommand`)

## Requirements served

- plan-docker_management_app/REQ-76
