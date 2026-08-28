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

## Rules and invariants

- **Every command that exits successfully says the discovery has changed** to the refresh cache
  (`composeProjectsCache.markChanged()`, module `refresh-cache`), before the project is re-read, so
  the stack the operator just started shows on the next request without waiting for a timer. It is
  done in the one place all four commands pass through, so none of them can forget. A command that
  failed or was cancelled marks nothing.

## Dependencies

- compose: ComposeDiscoveryService (`getComposeProject`, `composeProjectsCache`)
- docker-access: CLI runner (`runCliCommand`)

## Requirements served

- plan-docker_management_app/REQ-76
- plan-docker_management_app-refresh_cache/REQ-13
