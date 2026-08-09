---
module: contexts
component: DaemonInfoService
type: backend service
---

# DaemonInfoService

**Purpose** → what the daemon of the active context reports about itself: versions, drivers,
platform, root directory and container counts.

## Contract

- `getDaemonInfo(): Promise<DaemonInfo>`
  - `DaemonInfo`: `{ version, apiVersion, minApiVersion?, buildkitVersion?, storageDriver,
    cgroupDriver, cgroupVersion?, operatingSystem, osType, kernelVersion, architecture,
    rootDirectory, containers: { total, running, paused, stopped } }`.
  - `version` / `apiVersion` / `minApiVersion` are the daemon's own reported versions — the daemon's
    Engine API version, not the version this application negotiated down to.
  - `buildkitVersion` is the version the local buildx plugin reports; **absent when the plugin is not
    installed**, which is not a failure of the reading — the daemon exposes no BuildKit component of
    its own, so this is the only reading available.
  - Every field the daemon leaves unreported reads `"unknown"` rather than being absent; the
    container counts read `0`.
  - Reads the daemon of the **active context**: after a switch, the next call describes the new
    daemon.
  - Rejects with a `DockerDaemonError` when the daemon is unreachable or refuses the call.

## Dependencies

- docker-access: EngineClient (the shared, active-context client), CLI runner

## Requirements served

- plan-docker_management_app/REQ-94
