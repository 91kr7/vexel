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
    memoryUsageBytes?, memoryLimitBytes?, onlineCpus?, networkRxBytes?, networkTxBytes? }`.
  - `state`: `'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead'`.
  - `status` is the daemon's own human-readable status text (e.g. `"Up 3 days"`,
    `"Exited (0) 2 hours ago"`).
  - `ports`: `{ privatePort, publicPort?, type }[]`, **each mapping appearing exactly once**, in a
    **total order of this service's own**: by private port, then public port, then protocol.
  - `cpuPercent`/`memoryUsageBytes`/`memoryLimitBytes`/`onlineCpus`/`networkRxBytes`/
    `networkTxBytes` are present only for a `running` container whose latest sample is **less than
    30 seconds old**; all six come from **one** sample and are absent together, and a container the
    sampler has never read, one that has stopped, and one whose reading has gone stale are
    indistinguishable to a caller — each simply has no figures.
  - `onlineCpus` is the number of host CPUs `cpuPercent` is measured against, so `cpuPercent`
    reaches `onlineCpus × 100` at full load and a caller can state the reading over its capacity.
  - `networkRxBytes`/`networkTxBytes` are the bytes received and sent since the container started,
    summed over its interfaces.
  - **Ordered by container name** under the list-order rule (`compareNames`), with the container's
    `id` as the final comparison: `app-2` before `app-10`, `Redis` next to `redis-cache`, and two
    containers whose names differ only in case or in leading zeros separated by their ids.
  - The same containers produce the **same sequence on every read**, whatever order the daemon
    supplied them in.
- `startContainer(id)`, `stopContainer(id)`, `restartContainer(id)`, `pauseContainer(id)`,
  `unpauseContainer(id)`, `killContainer(id)`: `Promise<void>` — the matching Engine API lifecycle
  call.
- `removeContainer(id): Promise<void>` — force-removes the container (`DELETE
  /containers/{id}?force=true`) regardless of its current state.
- `renameContainer(id, name): Promise<void>` — `POST /containers/{id}/rename?name=...`.
- `pruneStoppedContainers(): Promise<PruneResult>` — `POST /containers/prune`;
  `PruneResult`: `{ removedIds: string[], reclaimedBytes: number }`.
- `STATS_SAMPLE_INTERVAL_MS: 10000` — the sampling interval, and the period the subscription
  endpoint writes at.
- `startStatsSampling(): void` — starts the CPU/memory sampler **and takes a sample immediately**,
  so a consumer that has just arrived waits for figures for the duration of one daemon call rather
  than for a whole interval; idempotent (a second call while it runs is a no-op).
- `stopStatsSampling(): void` — stops it: no further stats request reaches the daemon; idempotent.
- `isStatsSamplingActive(): boolean` — whether the sampler is running.
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

- One pass is `GET /containers/json` (running only) plus one `GET
  /containers/{id}/stats?stream=false` per running container: a bounded refresh rate, not a
  per-request fetch, so listing containers never blocks on the daemon's stats endpoint.
- **The sampler runs only while it is started, and nothing here starts it.** It is started and
  stopped by `StatsDemandRegistry`, on the count of consumers being shown the figures; a process
  with no consumer issues no stats request at all, on any screen and with no browser attached.
- **Passes never overlap and never queue.** A tick arriving while the previous pass is still out is
  dropped, so a pass slower than the interval gains no second pass beside it and no backlog builds
  up — however slow the daemon is and however many containers are running.
- A container's cached sample is dropped as soon as it no longer appears in the running set, so a
  stopped container never reports a stale CPU/memory reading.
- **A reading older than three intervals reaches no consumer**, by the same route a stopped
  container's absent sample already takes: the bound is stated in exactly one place, as a multiple
  of the interval, and it is what stops a number measured before the gate closed from being
  redisplayed on return as though it had just been taken. Nothing exposes the age of a sample; the
  choice is between a current figure and none.
- **`ports` carries no duplicates, and the daemon's own answer does.** The daemon reports one entry
  per host binding, so a port published on both IP stacks arrives twice — same private port, same
  public port, same protocol, differing only by a host IP this shape does not carry. Once the IP is
  dropped the two entries are indistinguishable, so they are collapsed to one here rather than in
  each reader: every consumer of this shape would otherwise inherit the pair, and one that keys by
  what it can see cannot tell a real pair from an artefact of dual-stack binding. Found 2026-08-25
  through the containers card, which draws one chip per entry and was given duplicate React keys by
  it; the delivered table joined the entries into a single line, which hid the same duplication
  rather than escaping it. This is a rule about **this shape only**: `inspectContainer`'s bindings
  carry the host IP, so they are not indistinguishable and are not collapsed — the detail panel still
  shows a dual-stack publication as the two bindings it is.
- **`ports` is ordered by this service, and the order is imposed rather than observed.** The
  daemon's own order is **not stable across reads**: three consecutive reads of the same unchanged
  container return the same mappings rotated. That is invisible to a consumer showing all of them
  and decisive for one showing a **subset** — the containers card draws the first two mappings and
  then a `+n`, so an unstable order hands it a *different subset* each poll and two chips swap
  identity while the container has not changed (found 2026-08-25 on the running product, measured
  over three consecutive reads). Sorting by private port, then public port, then protocol makes the
  key **total**: no two mappings of one container can tie, so the sequence is identical read to
  read, a subset of it is the same subset, and the detail panel agrees with the card by
  construction instead of by coincidence. The delivered table read the same field in the same
  unstable order and simply never showed the instability; it is deterministic now too. **A later
  reader must not remove this sort as redundant** — what it prevents cannot be seen in a single
  read. The comparison itself is not written here: it goes through the list-order rule
  (`byNameThenIdentity`, the ports compared as a composite name of private then public port under
  its numeric collation, with the mapping's own key as the final exact comparison), which is where
  every ordering on the server is decided (plan-docker_management_app-list_ordering/REQ-1).
- **The widened fields cost the daemon nothing** (plan-docker_management_app-containers_card_view/REQ-13).
  `onlineCpus` and the network totals are read out of the **same stats frame** the sampler already
  fetched for `cpuPercent` — the CPU count was computed inside it and thrown away, the `networks`
  block was never read. No request, endpoint, rate or lifecycle changed to obtain them. The network
  sum is the one `ContainerStatsService` normalises for the detail panel, so the list and the panel
  cannot report different figures for the same container.
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
- containers: StatsDemandRegistry (the caller of the start/stop pair; no import in this direction)
- image-analysis: `INTERNAL_CONTAINER_LABEL`
- list-order: List order (`byNameThenIdentity`)

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
- plan-docker_management_app/REQ-54
- plan-docker_management_app-list_ordering/REQ-8
- plan-docker_management_app-list_ordering/REQ-12
- plan-docker_management_app-containers_card_view/REQ-5
- plan-docker_management_app-containers_card_view/REQ-13
- plan-docker_management_app-containers_card_view/REQ-39
- plan-docker_management_app-containers_card_view/REQ-40
- plan-docker_management_app-containers_card_view/REQ-52
- plan-docker_management_app-containers_card_view/REQ-55
- plan-docker_management_app-containers_card_view/REQ-58
