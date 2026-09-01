---
module: volumes
component: useVolumeInspect
type: frontend hook
---

# useVolumeInspect

**Purpose** → reads a single volume's inspect data, re-reading on selection change.

## Contract

- `useVolumeInspect(name: string | undefined): { inspect?: VolumeInspect, loaded: boolean, error?:
  string, refresh: () => void }`
  - Reads when `name` changes (to a defined value).
  - Returns an empty, not-loaded result while `name` is `undefined` (no volume selected).

## Rules and invariants

- Reads when the detail is opened on a volume and when the operator asks for a refresh, and at no
  other moment. A daemon event triggers nothing, so a container that mounted the volume and has
  since been removed elsewhere is still named under "Mounted by" until the operator refreshes, and
  nothing on screen says so (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-10).
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its object scope is unchanged,
  and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Volumes client (fetchVolumeInspect)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-71
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
