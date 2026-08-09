---
module: connectivity
component: ConnectionStatusService
type: backend service
---

# ConnectionStatusService

**Purpose** → the single place that answers "is the daemon reachable, what API version did we
negotiate, and which local CLI/plugins are available" (REQ-9, REQ-10, REQ-13, REQ-110).

## Contract

- `getConnectionStatus(): Promise<ConnectionStatus>`
  - `ConnectionStatus`: `{ daemon: { reachable, cause? }, apiVersion?, engineVersion?, cli: { docker,
    compose, buildx }, unavailableCapabilities: string[] }`.
  - `daemon.reachable` is `false` with `cause` set to the daemon's own message when the endpoint
    cannot be reached; `apiVersion`/`engineVersion` are only set when reachable.
  - `unavailableCapabilities` names, in plain language, what becomes unavailable for each missing
    CLI tool/plugin (e.g. compose projects, multi-platform builds, the raw console CLI channel).
- `getEngineClient(): EngineClient` — re-export of the Docker access layer's shared client, kept here
  for the areas that already read it from this service. The instance follows the active context, so
  the probe always describes the daemon every other area is talking to (REQ-93).

## Rules and invariants

- The status is read fresh on every call — never memoized — so it describes the currently active
  context and not the one selected when the process started.

## Dependencies

- docker-access: EngineClient (shared client), CLI runner

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
