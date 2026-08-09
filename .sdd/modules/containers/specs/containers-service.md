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
  `GET /containers/json?all=true`, excluding any container carrying the image-analysis module's
  `INTERNAL_CONTAINER_LABEL` (an intermediate filesystem-extraction container never appears here,
  REQ-54).
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
- `getContainerInspect(id): Promise<ContainerInspect>` — full inspect data via `GET
  /containers/{id}/json` (REQ-24, REQ-26).
  - `ContainerInspect`: `{ id, name, image, command, entrypoint, createdAt, state: { status,
    startedAt?, finishedAt?, exitCode? }, restartPolicy, resourceLimits, env, ports, mounts,
    networks, labels, healthCheck?, health?, raw }`.
  - `restartPolicy`: `{ name, maximumRetryCount? }`. `resourceLimits`: `{ cpus?, memoryBytes? }`,
    `cpus` read from `NanoCpus` falling back to `CpuQuota/CpuPeriod`.
  - `ports`: `{ containerPort, protocol, hostPort?, hostIp? }[]`. `mounts`: `{ type, source,
    destination, readOnly }[]`. `networks`: `{ name, ipAddress? }[]`.
  - `healthCheck` (config) and `health` (latest results: `{ status, failingStreak?, log: { start,
    end, exitCode, output }[] }`) are `undefined` when the container defines no health check.
  - `raw` is the full inspect payload exactly as received, unmodified (REQ-26).
- `updateContainerConfig(id, update): Promise<ContainerConfigUpdateResult>` — applies a
  configuration change (REQ-25).
  - `ContainerConfigUpdate`: `{ restartPolicy?, resourceLimits?, env?, ports?, mounts?,
    healthCheck?: HealthCheckConfig | null }`; a field left `undefined` keeps its current value.
  - `ContainerConfigUpdateResult`: `{ path: 'in-place' | 'recreate', container: ContainerSummary }`
    — the fresh summary of the (possibly new) container.
  - Branch, decided by which fields are present in `update` (pseudocode):
    ```
    if update.env, update.ports, update.mounts and update.healthCheck are all undefined:
      apply restartPolicy/resourceLimits via POST /containers/{id}/update  →  path = 'in-place'
    else:
      inspect the container; stop it; remove it; create a new container under the same name
        with the merged config (unchanged fields taken from the original inspect); reconnect
        every network it was attached to; restart it if it was running before  →  path = 'recreate'
    ```

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
- A recreate always preserves the container's name, mounts and network attachments; it restarts the
  new container only if the original was running when the recreate began.
- Neither removal path — `removeContainer`, nor the removal inside a recreate — takes the
  container's volumes with it, anonymous ones included: `removeContainer` is the operator's own "rm"
  on their own container and behaves as `docker rm` does, and a recreate deliberately keeps the
  replaced container's volumes so that editing a setting never destroys data. A volume is only
  removed along with its container where the container was the application's own, created and never
  handed to the operator (the intermediate extraction container).

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError
- image-analysis: `INTERNAL_CONTAINER_LABEL`

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
- plan-docker_management_app/REQ-54
