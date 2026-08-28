---
module: networks
component: useNetworkInspect
type: frontend hook
---

# useNetworkInspect

**Purpose** → reads a single network's inspect data, re-reading on selection change and whenever a
related daemon event arrives.

## Contract

- `useNetworkInspect(id: string | undefined): { inspect?: NetworkInspect, loaded: boolean, error?:
  string, refresh: () => void }`
  - Reads when `id` changes (to a defined value), on a `network` event about that same network, and
    on every `container` event.
  - Returns an empty, not-loaded result while `id` is `undefined` (no network selected).

## Rules and invariants

- A `network` event about another network is ignored: the daemon is not asked about the shown
  network (plan-docker_management_app-refresh_cache/REQ-7). The event is attributed by its
  `actorId`; one carrying none is treated as about the shown network, so no change is ever missed
  (plan-docker_management_app-refresh_cache/REQ-8).
- Every `container` event still re-reads, whichever container it is about: the containers attached to
  the network are part of what the view shows, and a container event can change that list.
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its event filter and its
  object scope are unchanged, and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Networks client (fetchNetworkInspect)
- events: subscribeToDaemonEvents, daemonEventConcerns
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
- plan-docker_management_app-refresh_cache/REQ-7
- plan-docker_management_app-refresh_cache/REQ-8
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
