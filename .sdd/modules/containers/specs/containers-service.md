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
  - `ports`: `{ privatePort, publicPort?, type }[]` — the container's **publications on the host and
    only those**, as `getContainerInspect`'s own `ports` states them: an entry the daemon returns
    with no public port is an exposure and is not a mapping. **Each mapping appears exactly once**,
    in a **total order of this service's own**: by private port, then public port, then protocol.
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
  - `ports`: `{ containerPort, protocol, hostPort?, hostIp? }[]` — every port the container
    **publishes on the host, and only those**: one entry per publication, each carrying the host port
    actually in force, including where the operator named none and the daemon chose it. A port merely
    exposed is not an entry. Ordered by container port, then host port, as the summary's are.
    `mounts`: `{ type, source, destination, readOnly }[]`. `networks`: `{ name, ipAddress? }[]`.
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
- **The inspect reading is the container's publications and only those, and it takes two of the
  daemon's port maps to state them.** `HostConfig.PortBindings` is what the operator asked for: it
  names the set of publications, carries the host IP of each, and is the only map a stopped container
  fills. `NetworkSettings.Ports` is consulted for the one thing it alone knows — **the host port the
  daemon chose** where the operator named none. Before that the tab read `not published` on a port
  that was published, while the container's own card, reading the daemon's list, showed the number.
  **"You choose" has two spellings and both are read as one**: an empty `HostPort` (`-p 80`, `-P`)
  and a `HostPort` of `0` (`-p 0:5432`), which the daemon stores exactly as written. A host port of
  `0` is therefore not a host port in force, and a binding carrying either is completed from the
  observed map. An entry of that map carrying no host port is an exposure and not a publication, and
  is never an entry here.
- **One publication is one entry.** `NetworkSettings.Ports` records a publication once per IP stack,
  so `-p 8080:8080` appears there twice under one host port; a container port already accounted for
  is never added again, so it stays the single entry it is. A publication the **operator** made twice
  — two host IPs, two host ports — is two bindings in `PortBindings` and stays the two it is: that is
  the certified behaviour this rule leaves untouched, and it is why the summary shape's
  duplicate-collapsing rule above is about that shape alone.
- **A `-P` fills no bindings at all**, measured on Docker 29.7.2: `HostConfig.PortBindings` is `{}`
  and the publication exists solely in `NetworkSettings.Ports`, with a real host port. That map is
  therefore also the source of a publication the bindings do not name — restricted to entries
  carrying a host port, so nothing merely exposed can enter through it. Such an entry carries no host
  IP: the operator named none, and what they asked for was any interface.
- **`Config.ExposedPorts` is not a source**, and was one for part of a single day. It is the union of
  what the *image* declares and what the operator publishes, so on the human's own container it
  contributed a `5000/tcp` coming from `registry:2`'s own `EXPOSE` — a row saying "declared by
  somebody else, reachable from nowhere". `EXPOSE` binds no host port and gates no container-to-
  container traffic, its one effect being that `-P` publishes what it names
  (`plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-59`,
  which withdrew
  `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-58` and
  narrowed
  `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-52` to
  what its own title always said: mappings).
- **The two shapes answer the same question, and it took a change to each of them.** `GET
  /containers/json` does **not** list publications: it lists every port the container states, so
  `toSummary` passed exposures straight through and a container run `--expose 7777` from
  `registry:2` came back as two mappings on `/api/containers` and none at all on its inspect —
  measured on the built server on 2026-08-27, after the inspect reading had already been narrowed.
  So the summary drops an entry carrying no public port, by the same criterion the inspect reading
  uses on `NetworkSettings.Ports`: what binds nothing on the host is an exposure, not a mapping.
  **This reverses a ruling of this service's own**, and the reversal is the same human's, taken on
  2026-08-27 on new evidence and confirmed after they were shown their earlier decision and its
  reason: the 2026-08-25 annotation of `plan-docker_management_app-containers_card_view/REQ-5` had
  the chips carry exposed-but-unpublished ports as well as published mappings, grounded on
  `plan-docker_management_app-containers_card_view/REQ-12` — no value the delivered row showed may
  disappear from the card. An exposed port binds no host port and gates no container-to-container
  traffic, so what leaves the card is not a value being lost but an entry that never told the
  operator anything; REQ-12 stands for every other value the row showed
  (`plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-60`).
  The absence itself is still stated — the card's `PORTS` row reads `none` rather than vanishing,
  which is `containers_card_view`'s own rule and is untouched here.
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
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-52
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-59
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-60
