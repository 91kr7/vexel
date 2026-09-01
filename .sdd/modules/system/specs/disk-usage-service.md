---
module: system
component: DiskUsageService
type: backend service
---

# DiskUsageService

**Purpose** → disk space as the daemon accounts for it, in two readings: what a prune could reclaim
right now, broken down by the five categories a prune acts on, and what is occupied in total, broken
down by images, containers, volumes and build cache. It also owns the one held reading of
`GET /system/df` the rest of the server derives its disk figures from.

## Contract

- `getDiskUsage(): Promise<DiskUsageBreakdown>`
  - `DiskUsageBreakdown`: `{ categories: DiskUsageCategory[], totalReclaimableBytes }`.
  - `DiskUsageCategory`: `{ id, sizeBytes, itemCount, items, unavailableDetail? }`.
  - `id` is one of `"stopped-containers" | "dangling-images" | "unused-volumes" |
    "unused-networks" | "build-cache"`, and the categories are always returned in that order,
    exactly once each — also exported as `DISK_USAGE_CATEGORY_IDS`.
  - `items` — what the category holds, named: container names, image short ids, volume names,
    network names, cache record ids. Capped at 20 entries; `itemCount` is the true count.
  - `unavailableDetail` — present exactly when that one category could not be read; its
    `sizeBytes` and `itemCount` are then `0` and `items` empty.
  - `totalReclaimableBytes` — the sum of the categories' `sizeBytes`.
- What each category counts:
  ```
  stopped-containers → containers in state created / exited / dead
                       size = sum of their writable-layer size
  dangling-images    → images with no tag other than <none>:<none> and no container using them
                       size = sum of (own size − size shared with other images), never negative
  unused-volumes     → volumes with no container referencing them
                       size = sum of their usage size
  unused-networks    → networks with no attached container, excluding bridge / host / none
                       size = 0 (a network occupies no disk)
  build-cache        → build-cache records in the "reclaimable" state
                       size = sum of their sizes
  ```
- `getDiskUsageTotals(): Promise<DiskUsageTotals>` — answered from the **held** disk accounting
  (`diskUsageCache` below) and the **held** build-cache inventory; only a call arriving when nothing
  is held yet waits for a reading of its own.
  - `DiskUsageTotals`: `{ categories: DiskUsageTotalCategory[], totalBytes }`.
  - `DiskUsageTotalCategory`: `{ id, sizeBytes, itemCount, unavailableDetail? }`.
  - `id` is one of `"images" | "containers" | "volumes" | "build-cache"`, and the categories are
    always returned in that order, exactly once each — also exported as
    `DISK_USAGE_TOTAL_CATEGORY_IDS`.
  - `unavailableDetail` — present exactly when that one category could not be read; its `sizeBytes`
    and `itemCount` are then `0`.
  - `totalBytes` — the sum of the categories' `sizeBytes`.
- What each total category counts:
  ```
  images      → every image the daemon lists
                size = the daemon's own image-store total, layers shared between two images
                       counted once (so smaller than the sum of the images' individual sizes)
  containers  → every container, whatever its state, minus this application's own internal
                filesystem-extraction containers
                size = sum of their writable-layer size (the image they run is already counted
                       under images)
  volumes     → every volume the daemon lists
                size = sum of their usage size
  build-cache → every build-cache record, whatever its usage state
                size = sum of their sizes
  ```
- `diskUsageCache` — the refresh-cache kind the daemon's whole disk accounting is held under: key
  `disk-usage`, period 5 minutes — the longest in the cache — read as `GET /system/df` and holding
  that payload as the daemon returned it (see `refresh-cache.md`, module `refresh-cache`).
  - marked due by what can make a size **drop**: a volume removed, a container removed (their
    `destroy` events), and this application's own `removeVolume`, `pruneVolumes` and successful
    system prune. Other `volume`/`container` events — a container started, stopped or health-checked
    — do not mark it due, however many of them arrive.
  - it is the **only** held reading of that call on the server: the per-volume sizes and the
    occupied-space breakdown are two views of it, not two readings.
- `heldDiskUsage(onFirstRead?): RawDiskUsage | undefined` — the reading held right now, `undefined`
  while none is. `RawDiskUsage` is the daemon's own `/system/df` payload: `Containers`, `Images`,
  `Volumes`, `LayersSize`.
  - it **never waits**: the read is asked for and deliberately not awaited, so no caller pays for
    `/system/df` on a call of its own.
  - `onFirstRead` is called once a read lands while nothing was held — how a caller that answered
    without the reading knows there is something new to answer with.

## Rules and invariants

- A failure to read one category never fails the whole breakdown: the category answers with
  `unavailableDetail` instead, so a host without `buildx` still gets the other four. A failure of
  the daemon's own disk-usage reading does reject — without it there is no breakdown at all. Both
  readings behave this way.
- Reclaimable and occupied are two different questions and each is answered once, here: the
  occupied breakdown is not derivable from the reclaimable one (an image in use occupies disk and
  reclaims nothing), and no caller reads the daemon's disk-usage accounting of its own.
- **The reclaimable breakdown stays direct and is held nowhere.** It is read when the screen asks
  for it and never on a schedule, which is the decision this area took from the start.
- **`GET /system/df` is read once per period for the whole server, however many callers want it.**
  It is the most expensive call the daemon answers on a large host, so it is held under one kind and
  every consumer is a view of that one reading: the per-volume sizes (module `volumes`), the
  occupied-space breakdown, and through it the dashboard's overview. A repeated caller therefore
  asks the daemon for nothing
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22).
- **Only the first call waits.** With nothing held, `getDiskUsageTotals` waits for the reading, so a
  freshly started server answers with real figures rather than zeros. Every call after it answers
  from what is held and asks for a read it does not wait for.
- The occupied breakdown counts every object, whatever its state — that is what makes it differ
  from the reclaimable one — except this application's own internal filesystem-extraction
  containers, which are plumbing the operator never sees anywhere in the application.
- The reading never removes anything and never starts anything on the daemon.
- The categories are stated as facts, not as sentences: the wording an operator reads ("2
  containers not running") is composed by the screen from `itemCount`/`items`, so the server holds
  no UI copy.
- A paused or restarting container is not counted as stopped: `docker container prune` does not
  remove one, so counting it would promise space that no prune reclaims.
- The build cache is read through the same channel that prunes it (the build-cache service), so the
  size shown and the size a prune reports come from one source; only records the prune actually
  takes ("reclaimable") are counted, never the shared or in-use ones.

## Dependencies

- docker-access: Engine API client (via connectivity's `getEngineClient`)
- networks: NetworksService (`listNetworks`)
- builders: BuildCacheService (`listBuildCache`, `buildCacheListCache`)
- image-analysis: FilesystemExtractionService (`INTERNAL_CONTAINER_LABEL`)
- refresh-cache: RefreshCache (`registerRefreshKind`)
- events: EventStreamService (the `destroy` events that mark the reading due)

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-16
- plan-docker_management_app-refresh_cache/REQ-18
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-22
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-23
