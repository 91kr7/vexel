---
module: networks
component: useNetworkInspect
type: frontend hook
---

# useNetworkInspect

**Purpose** → reads a single network's inspect data, re-reading on selection change.

## Contract

- `useNetworkInspect(id: string | undefined): { inspect?: NetworkInspect, loaded: boolean, error?:
  string, refresh: () => void }`
  - Reads when `id` changes (to a defined value).
  - Returns an empty, not-loaded result while `id` is `undefined` (no network selected).

## Rules and invariants

- Reads when the detail is opened on a network and when the operator asks for a refresh, and at no
  other moment. A daemon event triggers nothing, so a container attached or detached elsewhere
  leaves the open detail showing the attachments it last read, and nothing on screen says so
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-10).
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its object scope is unchanged,
  and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Networks client (fetchNetworkInspect)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-73
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
- plan-docker_management_app/REQ-74
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
