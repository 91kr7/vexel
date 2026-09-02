---
module: app-shell
component: RefreshControl
type: UI component
---

# RefreshControl

**Purpose** → the top bar's one refresh control: one press reloads what the server holds, then every
mounted view re-reads, and the operator is told the reload ran.

## Contract

Description:
- A single icon-only control (`IconButton`, glyph `↻`, accessible name "Refresh"), rendered in the
  page header's actions and therefore present on every screen.
Actions:
- Press → asks the server to read again every value it holds (`POST /api/refresh`), then raises the
  reload signal and waits for every subscribed view to have re-read, **and for the live channel to
  have delivered what that reading produced**. The control is busy for the whole of that, and
  returns to rest when all of it has ended.
- Press while busy → nothing happens: no second request, no second signal.
- On success → a toast, tone success, titled "Refreshed". It says nothing about what changed.
- On failure — the request failed, or the server reports at least one value it could not read
  again → a toast, tone danger, titled "Refresh failed", carrying the cause. The control returns to
  rest with no failed state left on it and can be pressed again at once.

## Rules and invariants

- The refusal of a second press is decided at the press, not at the render that follows it: the
  control is `disabled` while busy **and** an in-flight press is refused by the handler, so two
  presses in the same tick still start one reload.
- It reads no data and holds none: it says "read again" and waits. What each view then shows is the
  view's own business.
- It navigates nowhere, closes nothing and resets no scroll position or selection: the reload
  replaces data only.
- A failed reload leaves the screens showing the values they had — no view is blanked by a failure.
- **The endpoint answering is not the screen being current.** The values a screen reads from the
  channel travel on a different connection from the answer, so the wait for the channel's
  end-of-reload message is parked **before** the request is made — a wait raised after the answer
  could miss a message that arrived first (…-multiplexed_sse/REQ-23, /REQ-34).

## Dependencies

- ui-library: IconButton (busy state), useToast
- Reload signal
- Refresh client (`requestServerReload`)
- live-channel: Live channel client (`awaitReloadEnd`)

## Requirements served

- plan-docker_management_app-refresh_cache-manual_refresh/REQ-1
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-2
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-3
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-4
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-5
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-6
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-23
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-34
