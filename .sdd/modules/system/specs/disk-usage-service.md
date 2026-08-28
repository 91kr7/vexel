---
module: system
component: DiskUsageService
type: backend service
---

# DiskUsageService

**Purpose** → disk space as the daemon accounts for it, in two readings: what a prune could reclaim
right now, broken down by the five categories a prune acts on, and what is occupied in total, broken
down by images, containers, volumes and build cache.

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
- `getDiskUsageTotals(): Promise<DiskUsageTotals>`
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

## Rules and invariants

- A failure to read one category never fails the whole breakdown: the category answers with
  `unavailableDetail` instead, so a host without `buildx` still gets the other four. A failure of
  the daemon's own disk-usage reading does reject — without it there is no breakdown at all. Both
  readings behave this way.
- Reclaimable and occupied are two different questions and each is answered once, here: the
  occupied breakdown is not derivable from the reclaimable one (an image in use occupies disk and
  reclaims nothing), and no caller reads the daemon's disk-usage accounting a second time of its
  own. Each call makes exactly one such reading, whichever question it answers.
- **Both readings stay direct and are held nowhere.** They are read when the screen asks for them
  and never on a schedule — the decision this area took from the start, because `/system/df` is the
  most expensive call the daemon answers on a large host. The volume sizes, the one value that used
  to be read from here for another screen, are now held under their own refresh-cache kind
  (`volume-sizes`, module `volumes`); nothing about these two breakdowns changed with it.
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
- builders: BuildCacheService (`listBuildCache`)
- image-analysis: FilesystemExtractionService (`INTERNAL_CONTAINER_LABEL`)

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-16
