---
module: compose
component: useComposeProjects
type: frontend hook
---

# useComposeProjects

**Purpose** → reads the compose project list, kept fresh without a manual refresh.

## Contract

- `useComposeProjects(): { projects, loaded, error?, refresh }`
  - Reads on mount, on a bounded poll, and on every `container` daemon event (a compose project is
    made of containers).
  - `refresh()` re-reads on demand (e.g. right after a lifecycle action).

## Rules and invariants

- Re-reads from scratch when another context becomes the active one: the list belonged to the
  daemon left behind (REQ-93).
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- compose: Compose client (`fetchComposeProjects`)
- events: daemon event subscription
- contexts: Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
