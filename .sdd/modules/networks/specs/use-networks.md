---
module: networks
component: useNetworks
type: frontend hook
---

# useNetworks

**Purpose** → reads the network list, re-reading on a bounded poll and whenever a related daemon
event arrives.

## Contract

- `useNetworks(): { networks: NetworkSummary[], loaded: boolean, error?: string, refresh: () => void
  }`
  - Reads on mount, on a 3-second poll, and on every `network` or `container` daemon event (a
    container's own attachments changing which networks list it) (REQ-72).
  - `refresh()` re-reads on demand; `loaded` becomes `true` once the first read settles (success or
    failure); `error` carries the last failure's message.

## Rules and invariants

- Re-reads from scratch when another context becomes the active one: the list belonged to the
  daemon left behind (REQ-93).
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- contexts: Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
