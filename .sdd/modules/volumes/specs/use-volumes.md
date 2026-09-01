---
module: volumes
component: useVolumes
type: frontend hook
---

# useVolumes

**Purpose** → reads the volume list, re-reading on a bounded poll.

## Contract

- `useVolumes(): { volumes: VolumeSummary[], loaded: boolean, error?: string, refresh: () => void }`
  - Reads on mount and on a 3-second poll (the declared figure, multiplied by the page's timing
    scale) (REQ-70).
  - `refresh()` re-reads on demand; `loaded` becomes `true` once the first read settles (success or
    failure); `error` carries the last failure's message.

## Rules and invariants

- **Mounted by `VolumesNetworksScreen` alone, so it runs only while that screen is on screen.** That
  is what decides its cost: with nobody there it does not run, the server's demand for the volume
  listing expires, and what the server held is dropped — nothing reads volumes from the daemon at all
  until the screen is opened again
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40, REQ-41). The first
  read after such an absence is therefore a real reading of the daemon rather than a held value: one
  wait per visit, and accepted.
- Reads for no other reason of its own: a daemon event triggers nothing here
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1).
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

- plan-docker_management_app/REQ-70
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-41
