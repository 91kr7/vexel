---
module: system
component: PruneService
type: backend service
---

# PruneService

**Purpose** → prunes one category, or a chosen set of them in a single run, reporting what was
removed and the space the daemon says was actually reclaimed.

## Contract

- `pruneCategory(categoryId): Promise<CategoryPruneOutcome>`
  - `CategoryPruneOutcome`: `{ categoryId, removed: string[], removedCount, reclaimedBytes,
    error? }`.
  - Delegates to the service that owns the category:
    ```
    stopped-containers → containers prune      (removed = container ids, reclaimed reported)
    dangling-images    → dangling-image prune  (removed = image ids/digests, reclaimed reported)
    unused-volumes     → volume prune          (removed = volume names, reclaimed reported)
    unused-networks    → network prune         (removed = network names, reclaimed = 0)
    build-cache        → build-cache prune     (removed = [], reclaimed reported)
    ```
  - Rejects if the underlying channel rejects.
- `pruneScope(scope: DiskUsageCategoryId[]): Promise<PruneRunResult>`
  - `PruneRunResult`: `{ categories: CategoryPruneOutcome[], reclaimedBytes }`.
  - Runs the requested categories one at a time, always in the canonical category order, whatever
    order the scope names them in; a repeated id is run once.
  - A category that fails contributes an outcome carrying `error` (nothing removed, zero
    reclaimed) and the run continues with the next one.
  - `reclaimedBytes` is the sum of the outcomes' reclaimed space — what was actually freed, not
    what the breakdown estimated.
- `isDiskUsageCategoryId(value): boolean` — whether an unknown value names a category.

## Rules and invariants

- Nothing is removed here directly: every category goes through the existing prune of its own area,
  so this service adds the scope and the account of the run, never a second removal path.
- The fixed order runs containers first: the volumes and networks a stopped container held only
  become reclaimable once it is gone, so one scoped run reclaims them within the same call.
- A partial failure never hides the part that succeeded: half a prune has already changed the host,
  and the outcome names both what went and what failed.
- The scope is honored exactly: a category the caller did not name is never pruned, however cheap
  it would be to include.

## Dependencies

- system: DiskUsageService (category ids and their canonical order)
- containers: ContainersService (`pruneStoppedContainers`)
- images: ImageTransferService (`pruneDanglingImages`)
- volumes: VolumesService (`pruneVolumes`)
- networks: NetworksService (`pruneNetworks`)
- builders: BuildCacheService (`pruneBuildCache`)

## Requirements served

- plan-docker_management_app/REQ-96
