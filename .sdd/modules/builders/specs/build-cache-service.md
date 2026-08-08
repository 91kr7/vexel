---
module: builders
component: BuildCacheService
type: backend service
---

# BuildCacheService

**Purpose** → the build-cache inventory and its prune, through the local CLI channel.

## Contract

- `listBuildCache(): Promise<BuildCacheRecord[]>`
  - `BuildCacheRecord`: `{ id, type, sizeBytes, usageState }`, `usageState`:
    `"shared" | "in-use" | "reclaimable"`.
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
