---
module: images
component: useImages
type: frontend hook
---

# useImages

**Purpose** → the client-side read surface for the image list, kept current without the caller
managing polling or event subscriptions itself.

## Contract

- `useImages(): { images: ImageSummary[], loaded: boolean, error?: string, refresh: () => void }`
  - `images` starts empty and is replaced by the server's list once the initial fetch resolves.
  - `loaded` becomes `true` once the initial fetch has settled (successfully or not).
  - `error` carries the last fetch failure's message; cleared on the next successful fetch.
  - `refresh()` re-reads the list immediately.

## Rules and invariants

- Re-reads on a 3-second poll — the declared figure, multiplied by the page's timing scale — so the
  list reflects a pull/push/tag/untag/remove/prune without the operator refreshing (REQ-37, REQ-38,
  REQ-39).
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

- Images client (fetchImages)
- contexts: Active-context broadcast
- app-shell: Reload signal
- app-shell: useKeptReading

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-48
