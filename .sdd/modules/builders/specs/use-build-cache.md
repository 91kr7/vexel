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

## Rules and invariants

- Re-reads from scratch when another context becomes the active one: the list belonged to the
  daemon left behind (REQ-93).
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- builders: Builders client
- contexts: Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
