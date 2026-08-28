---
module: builders
component: BuildCacheService
type: backend service
---

# BuildCacheService

**Purpose** → the build-cache inventory and its prune, through the local CLI channel.

## Contract

- `listBuildCache(): Promise<BuildCacheRecord[]>`
  - `BuildCacheRecord`: `{ id, type, sizeBytes, usageState, description? }`, `usageState`:
    `"shared" | "in-use" | "reclaimable"`.
  - `description` — the build step the record was produced by, as buildx recorded it (e.g.
    `mount / from exec /bin/sh -c …`, `[3/3] COPY x /y`, `local source for context`); absent when
    buildx recorded none or recorded it blank. It is what the traceability of REQ-68/REQ-69 matches
    a layer against.
  - **Ordered by record identifier, ascending**, under the list-order rule — the identifier standing
    in for the name a record has not got, and being also the final comparison, so two records never
    tie. The same records produce the **same sequence on every read**, whatever order `buildx du`
    listed them in.
  - **The order is deliberately not a ranking**: not by size, not by usage state, not by the
    recorded build step. A record carries no operator-given name and no creation time, so this order
    is arbitrary but stable, and stable is what was asked for; ranking the panel is a product
    decision that has not been taken, and must not arrive as a side effect of a determinism fix.
  - `usageState` pseudocode:
    ```
    if record is not reclaimable → "in-use"      (attached to a build in progress)
    else if record is shared     → "shared"      (reclaimable, referenced by more than one build)
    else                         → "reclaimable"
    ```
- `buildCacheListCache` — the refresh-cache kind the inventory is held under: key `build-cache`,
  period 30 s, **no event type** — buildx publishes none, and the prune below says so itself (see
  `refresh-cache.md`, module `refresh-cache`). `listBuildCache` is its read; the inventory above is
  unchanged by this.
- `pruneBuildCache(): Promise<BuildCachePruneResult>`
  - `BuildCachePruneResult`: `{ reclaimedBytes }`.
  - Removes every reclaimable record; rejects if `buildx prune`'s own reclaimed-space report cannot
    be parsed, rather than reporting zero.

## Rules and invariants

- `pruneBuildCache` says the inventory has changed once it has succeeded, so the reclaimed records
  disappear on the next request without waiting for a timer.

- Every call goes through the CLI channel (`docker buildx …`), never a direct daemon socket call.
- `docker buildx du` output is read as newline-delimited JSON, a single bare JSON object (the
  one-entry case) or a single JSON array — never assumed to be exactly one of those shapes.
- Neither export nor import of the cache is exposed (withdrawn half of REQ-91): `buildx` only offers
  those as flags of a build, and this service does not launch builds.
- A non-zero exit or a spawn failure of the underlying CLI command rejects with a `DockerDaemonError`
  (`docker-access`, code `DaemonRejected`) carrying the daemon's own message, so the REST layer maps
  it to `502` rather than an opaque `500`.

## Dependencies

- docker-access: CLI runner
- list-order: List order (`byNameThenIdentity`, the identifier standing in for the name)
- refresh-cache: Refresh cache (`registerRefreshKind`)

## Requirements served

- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
- plan-docker_management_app-list_ordering/REQ-37
- plan-docker_management_app-list_ordering/REQ-38
- plan-docker_management_app-list_ordering/REQ-43
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-13
