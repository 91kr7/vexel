---
module: app-shell
component: Reload signal
type: frontend data client
---

# Reload signal

**Purpose** → the application-wide "read it all again" broadcast, beside the active-context one. A
mounted view subscribes with its own read; one call raises the signal and ends only when every
subscribed read has ended. That is what lets a caller say "the reload has finished" and mean "the
screen in front of the operator is already showing the reloaded data".

## Contract

- `subscribeToReload(listener) → unsubscribe` — registers a read; `listener` may return a promise,
  and that promise is what the signal waits on. Calling the returned function removes it.
- `requestReload() → Promise<void>` — runs every subscribed read at once and settles when all of
  them have settled.
  - a read that rejects does not reject the signal and does not abandon the other reads: the view
    that failed keeps what it had and reports its own failure the way it always does
  - with nothing subscribed it settles immediately
- `reloadWhenChannelReturns() → unsubscribe` — raises one reload each time the live channel starts
  delivering again after it had stopped. Calling the returned function stops watching.
  - the channel's **first** open raises nothing: that is a start-up, and every mounted view has
    just read
  - one reload per return, whatever raised it — a channel the browser reopened on its own or the
    header's `Retry`

## Rules and invariants

- It carries no data and no Docker vocabulary: it says only that everything is to be read again.
- **A connection that comes back is a reason to read again**, and it is the only one this module
  raises on its own: the values the live channel feeds come back pushed, the readings taken by
  request come back this way, so the screen the operator is on fills with them navigating nowhere
  (plan-docker_management_app-inline_error_panels/REQ-12).
- It says nothing about the server. Asking the server to reload what it holds is the caller's step,
  before raising this signal.
- Subscribing does not read: a view is read only when the signal is raised.
- **A view subscribes its own internal read, never the `refresh()` it exposes.** The public
  `refresh()` of every data hook returns nothing, and that shape is contractual
  (plan-docker_management_app-refresh_cache/REQ-21): subscribing it would give the signal
  nothing to wait on, and making it return a promise instead breaks the screens that call it.

## Dependencies

- live-channel: Live channel client (whether it is delivering)

## Requirements served

- plan-docker_management_app-refresh_cache-manual_refresh/REQ-3
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-inline_error_panels/REQ-12
