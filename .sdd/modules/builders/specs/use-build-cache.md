---
module: builders
component: useBuildCache
type: frontend hook
---

# useBuildCache

**Purpose** → reads the build-cache inventory and drives its prune.

## Contract

- `useBuildCache(): { records, loaded, error?, refresh, prune }`
  - `records: BuildCacheRecord[]`, re-read on a bounded poll and via `refresh()`.
  - `prune(): Promise<BuildCachePruneResult>` — re-reads the inventory on success; a failure
    propagates to the caller.

## Dependencies

- builders: Builders client

## Requirements served

- plan-docker_management_app/REQ-91
