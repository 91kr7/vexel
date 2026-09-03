---
module: networks
component: useNetworks
type: frontend hook
---

# useNetworks

**Purpose** → the client-side read surface for the network listing: what the live channel has
delivered, with no request and no clock of its own.

## Contract

- `useNetworks(): { networks: NetworkSummary[], loaded: boolean, error?: string, refresh: () => void
  }`
  - `networks` is what the channel last delivered, and an empty list until it has delivered one.
  - `loaded` becomes `true` on the first listing delivered, and goes back to `false` when the channel
    says the values held were discarded.
  - `error` carries a failure while the channel is not delivering, and is cleared as soon as it is.
  - `refresh()` asks for the channel again when it is not delivering, and does nothing when it is:
    the listing arrives on the channel, so there is nothing to re-read.

## Rules and invariants

- **It holds no clock and makes no request**: the listing arrives when the server pushes it, so a
  network created, removed or attached to outside the application reaches the screen with the
  operator doing nothing (…-multiplexed_sse/REQ-17, /REQ-33, /REQ-39).
- **Mounting this hook no longer decides whether the server reads networks.** It is still mounted by
  `NetworksPanel` alone, but what keeps the server's demand alive is the open channel, which holds
  every value the refresh cache registers for as long as a window is open
  (…-multiplexed_sse/REQ-13). This is the stated departure from
  `plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40, REQ-41`: networks are
  read on the server's own period whenever a window is open, and the first visit to the screen waits
  for nothing.
- **A listing delivered again unchanged replaces nothing**: the reference in hand is kept, so the
  table under it is not redrawn and the operator's selection, search and scroll stay as they were.
  The rule lives in the pushed-value store this hook reads through (…-multiplexed_sse/REQ-12).
- Reads for no reason of its own: a daemon event triggers nothing here
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1).
- Nothing is re-read on a context switch: the server discards what it holds, says so on the channel,
  and the new context's listing arrives on it (…-multiplexed_sse/REQ-24).
- The manual reload reaches this listing on the channel like any other change; what makes the refresh
  control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- Networks client (`NetworkSummary`, the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-48
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
