---
module: containers
component: ContainersService
type: backend service
---

# ContainersService

**Purpose** → talks to the Docker Engine API to list every container with its live resource usage,
and to run lifecycle operations, rename and prune on the daemon's behalf.

## Contract

- `listContainers(): Promise<ContainerSummary[]>` — every container regardless of state, via
  `GET /containers/json?all=true`.
  - `ContainerSummary`: `{ id, shortId, name, image, state, status, ports, cpuPercent?,
    memoryUsageBytes?, memoryLimitBytes? }`.
  - `state`: `'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead'`.
  - `status` is the daemon's own human-readable status text (e.g. `"Up 3 days"`,
    `"Exited (0) 2 hours ago"`).
  - `ports`: `{ privatePort, publicPort?, type }[]`.
  - `cpuPercent`/`memoryUsageBytes`/`memoryLimitBytes` are present only for a `running` container
    that the sampler has read at least once since it started running.
- `startContainer(id)`, `stopContainer(id)`, `restartContainer(id)`, `pauseContainer(id)`,
  `unpauseContainer(id)`, `killContainer(id)`: `Promise<void>` — the matching Engine API lifecycle
  call.
- `removeContainer(id): Promise<void>` — force-removes the container (`DELETE
  /containers/{id}?force=true`) regardless of its current state.
- `renameContainer(id, name): Promise<void>` — `POST /containers/{id}/rename?name=...`.
- `pruneStoppedContainers(): Promise<PruneResult>` — `POST /containers/prune`;
  `PruneResult`: `{ removedIds: string[], reclaimedBytes: number }`.
- `startStatsSampler(): void` — starts the background CPU/memory sampler; idempotent (a second call
  is a no-op).

## Rules and invariants

- The sampler polls `GET /containers/json` (running only) plus one `GET
  /containers/{id}/stats?stream=false` per running container every 3 seconds (REQ-19): a bounded
  refresh rate, not a per-request fetch, so listing containers never blocks on the daemon's stats
  endpoint.
- A container's cached sample is dropped as soon as it no longer appears in the running set, so a
  stopped container never reports a stale CPU/memory reading.
- `cpuPercent` follows the Docker CLI's own formula: `(cpuDelta / systemDelta) * onlineCpus * 100`,
  `0` when either delta is not positive. `memoryUsageBytes` subtracts the cgroup page cache
  (`stats.cache`, falling back to `stats.inactive_file`) from the raw usage, matching `docker stats`.
- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure (no
  low-level error leaks to callers).

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
