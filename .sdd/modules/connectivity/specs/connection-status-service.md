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
- `getEngineClient(): EngineClient` — the shared EngineClient instance for the active context, reused
  by the events area so both probe and stream the same endpoint.

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
