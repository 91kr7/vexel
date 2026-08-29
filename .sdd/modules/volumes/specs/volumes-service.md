---
module: volumes
component: VolumesService
type: backend service
---

# VolumesService

**Purpose** → talks to the Docker Engine API to list local volumes with their size and mounting
containers, read a volume's full inspect data, create, remove and prune unused volumes. The sizes
are held on a schedule of their own, far slower than the listing's.

## Contract

- `listVolumes(): Promise<VolumeSummary[]>` — every volume via `GET /volumes`.
  - `VolumeSummary`: `{ name, driver, mountpoint, scope, createdAt, labels, options, sizeBytes?,
    mountedBy }`.
  - `sizeBytes` — **joined in from the held sizes** (`volumeSizeCache` below), never read by this
    call; `undefined` for a volume no size is held for yet. A listing never waits for a size: a
    volume created a moment ago is listed at once, without one, and gains it on a later read.
  - `mountedBy` — names of every container (running or stopped) whose own mounts reference the
    volume, **derived from the container listing the server already holds** (`ContainersService`'s
    `readHeldContainerList`) and never from a listing of this service's own; empty for an unattached
    volume. The application's own internal extraction containers are excluded there, so none of them
    is ever named here.
  - **Ordered named-first, anonymous last.** A volume is **anonymous** when its name is exactly 64
    hexadecimal characters — the shape the daemon generates for a volume nobody named.
    - every **named** volume comes before every anonymous one, ordered by name under the list-order
      rule (`compareNames`), with the name compared **exactly** as the final comparison (a volume
      carries no identifier other than its name), so `data` and `Data` are separated rather than
      tied;
    - the **anonymous** ones follow as one block, **newest first** by `createdAt`, with the name
      compared exactly as the final comparison;
    - a volume an **operator** deliberately named with 64 hexadecimal characters is grouped with
      the anonymous ones: no heuristic rescues it.
  - The same volumes produce the **same sequence on every read**, whatever order the daemon
    supplied them in.
- `volumeListCache` — the refresh-cache kind the listing is held under: key `volumes`, period 30 s,
  marked due by `volume` **and `container`** daemon events — a container mounting or releasing a
  volume changes what the list shows (see `refresh-cache.md`, module `refresh-cache`).
  `listVolumes` is its read; the listing above is unchanged by this. `getVolumeInspect` is **not**
  held: a detail read stays direct.
- `volumeSizeCache` — the refresh-cache kind the **per-volume sizes** are held under, separately
  from the listing: key `volume-sizes`, period 5 minutes — the longest in the cache — read as
  `GET /system/df`'s per-volume `UsageData.Size`, keyed by volume name.
  - marked due by what can make a size **drop**: a volume removed, a container removed (their
    `destroy` events), and this application's own `removeVolume`, `pruneVolumes` and successful
    system prune. Other `volume`/`container` events — a container started, stopped or health-checked
    — do not mark it due, however many of them arrive.
  - `listVolumes` and `getVolumeInspect` ask for it and **do not wait for it**: they join in what is
    already held. The first sizes to arrive mark the listing changed, so they show without waiting
    for the listing's own period.
- `getVolumeInspect(name): Promise<VolumeInspect>` — via `GET /volumes/{name}`; rejects with the
  daemon's own 404 for an unknown name. A direct read of the daemon, as it was — with `sizeBytes`
  joined in from the held sizes on the same terms as the listing, so one volume's detail no longer
  makes the daemon account for the whole host's disk usage.
  - `VolumeInspect`: `VolumeSummary & { raw }`; `raw` is the full inspect payload exactly as
    received.
- `createVolume(input): Promise<VolumeSummary>` — `POST /volumes/create` (REQ-71).
  - `input`: `{ name?, driver?, driverOpts?, labels? }`; an empty/blank `name` lets the daemon
    generate one; an empty/blank `driver` defaults to the daemon's own default (`local`).
- `removeVolume(name): Promise<void>` — `DELETE /volumes/{name}?force=true`.
- `pruneVolumes(): Promise<VolumePruneResult>` — `POST /volumes/prune?filters={"all":["true"]}`;
  prunes every currently unused volume, named or anonymous, not just anonymous ones.
  `VolumePruneResult`: `{ removedNames: string[], reclaimedBytes: number }`.

## Rules and invariants

- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure.
- `mountedBy` is read on every `listVolumes`/`getVolumeInspect` call from the held container
  listing, through the containers kind's `read()` and never its `peek()`: it covers the operation
  the application has just performed on a container, so a container removed a moment ago is no
  longer named here.
- **This service issues no container listing of its own.** Asking for the volume list therefore
  counts as asking for the container listing, and keeps it refreshed while the volumes screen is
  open — the containers kind's own demand expiry stops it once nothing is asking for either.
- **No call of this service makes the daemon compute its whole disk usage.** `/system/df` is read by
  the size kind's own refresher and by nothing else, so listing volumes and opening one's detail
  cost the daemon a listing each, whatever the host holds.
- An absent `sizeBytes` is a size not known **yet**, never an error and never a zero: the volume is
  shown without one.

### The refresh cache

- `createVolume`, `removeVolume` and `pruneVolumes` say the listing has changed once they have
  succeeded, so the operator's own action shows on the next request without waiting for a timer.
  A failed call marks nothing.
- `removeVolume` and `pruneVolumes` say the same of the sizes; `createVolume` does not — a volume
  that has just been created occupies nothing, and it is listed at once without a size.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError
- containers: ContainersService (`readHeldContainerList`)
- events: Event stream (the `destroy` events that mark the sizes due)
- list-order: List order (`byNamedThenUnnamedNewest`)
- refresh-cache: Refresh cache (`registerRefreshKind`)

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
- plan-docker_management_app-list_ordering/REQ-13
- plan-docker_management_app-list_ordering/REQ-14
- plan-docker_management_app-list_ordering/REQ-15
- plan-docker_management_app-list_ordering/REQ-16
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-12
- plan-docker_management_app-refresh_cache/REQ-13
- plan-docker_management_app-refresh_cache/REQ-18
- plan-docker_management_app-refresh_cache/REQ-19
- plan-docker_management_app-refresh_cache/REQ-37
- plan-docker_management_app-refresh_cache/REQ-38
- plan-docker_management_app-refresh_cache/REQ-41
- plan-docker_management_app-refresh_cache/REQ-42
- plan-docker_management_app-refresh_cache/REQ-43
