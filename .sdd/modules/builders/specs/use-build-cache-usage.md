---
module: builders
component: useBuildCacheUsage
type: frontend hook
---

# useBuildCacheUsage

**Purpose** → reads the images and layers one build-cache record relates to, for the Builders &
cache screen (REQ-69).

## Contract

- `useBuildCacheUsage(recordId?): { usage?, loaded, error?, refresh }`
  - `recordId` undefined → no request is made and the result stays empty; this is how an unselected
    record costs nothing.
  - `recordId` given → reads it once, and again on every `recordId` change and on `refresh()`.
  - `error` → the server's own message (including the `404` of an id no longer in the inventory);
    cleared by a later successful read.
  - `loaded` → true once a read has settled, whether it succeeded or failed.

## Rules and invariants

- Changing `recordId` clears the previous record's result before the new read, so no reference is
  ever shown under the wrong record.
- A record with no association is not an error: it arrives inside `usage` carrying its own reason.
- A read that settles after the hook is unmounted or after `recordId` changed is discarded.
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its event filter and its
  object scope are unchanged, and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- builders: Builders client (`fetchBuildCacheUsage`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-69
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
