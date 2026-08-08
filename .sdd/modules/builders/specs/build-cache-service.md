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
  - `usageState` pseudocode:
    ```
    if record is not reclaimable → "in-use"      (attached to a build in progress)
    else if record is shared     → "shared"      (reclaimable, referenced by more than one build)
    else                         → "reclaimable"
    ```
- `pruneBuildCache(): Promise<BuildCachePruneResult>`
  - `BuildCachePruneResult`: `{ reclaimedBytes }`.
  - Removes every reclaimable record; rejects if `buildx prune`'s own reclaimed-space report cannot
    be parsed, rather than reporting zero.

## Rules and invariants

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

## Requirements served

- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
