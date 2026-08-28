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
- `connectionStatusCache` — the refresh-cache kind the status is held under: key
  `connection-status`, period 30 s, **no event type** (see `refresh-cache.md`, module
  `refresh-cache`). `getConnectionStatus` is its read; the status above is unchanged by this.
- `getEngineClient(): EngineClient` — re-export of the Docker access layer's shared client, kept here
  for the areas that already read it from this service. The instance follows the active context, so
  the probe always describes the daemon every other area is talking to (REQ-93).

## Rules and invariants

- **The status keeps a real probe of the daemon.** It reports the negotiated Engine API and engine
  versions, and only a call to the daemon returns those; the event stream's health is used to say
  *when* to probe, never in place of probing.
- **An unreachable daemon is a successful read that reports it**, not a failed one: the held status
  becomes `reachable: false` with the daemon's own message. The interface is therefore told it
  cannot reach the daemon, and is never handed a stale "reachable".
- **The status is marked changed whenever the daemon event stream's own connection drops or comes
  back**, so the change is read at once instead of waiting up to a period. That stream is already
  open against the same daemon, which makes it the earliest and cheapest signal the server has.
- `getConnectionStatus` still reads fresh on every call — never memoized — so it describes the
  currently active context and not the one selected when the process started. What is held is
  dropped on a context change like every other value.

## Dependencies

- docker-access: EngineClient (shared client), CLI runner
- refresh-cache: Refresh cache (`registerRefreshKind`)
- events: EventStreamService (`onConnectionChanged`)

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-15
