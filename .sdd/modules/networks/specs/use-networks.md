---
module: networks
component: useNetworks
type: frontend hook
---

# useNetworks

**Purpose** → reads the network list, re-reading on a bounded poll.

## Contract

- `useNetworks(): { networks: NetworkSummary[], loaded: boolean, error?: string, refresh: () => void
  }`
  - Reads on mount and on a 3-second poll (the declared figure, multiplied by the page's timing
    scale) (REQ-72).
  - `refresh()` re-reads on demand; `loaded` becomes `true` once the first read settles (success or
    failure); `error` carries the last failure's message.

## Rules and invariants

- **Mounted by `NetworksPanel` alone, which is drawn only on the Volumes & networks screen, so it
  runs only while that screen is on screen.** That is what decides its cost: with nobody there it
  does not run, the server's demand for the network listing expires, and what the server held is
  dropped — nothing reads networks from the daemon at all until the screen is opened again
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40, REQ-41). The first
  read after such an absence is therefore a real reading of the daemon rather than a held value: one
  wait per visit, and accepted.
- **A reading equal to the one in hand replaces nothing**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47): the list keeps its
  identity, so the table under it is not redrawn. A reading that differs replaces it on the tick it
  arrives, within the same period as before (…-client_event_refresh_removal/REQ-48). The rule itself
  lives in app-shell's `useKeptReading`, which this hook stores its reading through.
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
- app-shell: useKeptReading

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-41
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-48
