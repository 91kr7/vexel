---
module: system
component: DiskUsageService
type: backend service
---

# DiskUsageService

**Purpose** → what a prune could reclaim right now, broken down by the five categories a prune acts
on, each with its size and what it holds.

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

## Rules and invariants

- A failure to read one category never fails the whole breakdown: the category answers with
  `unavailableDetail` instead, so a host without `buildx` still gets the other four. A failure of
  the daemon's own disk-usage reading does reject — without it there is no breakdown at all.
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

## Requirements served

- plan-docker_management_app/REQ-95
