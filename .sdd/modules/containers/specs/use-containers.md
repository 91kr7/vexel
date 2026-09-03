---
module: containers
component: useContainers
type: frontend hook
---

# useContainers

**Purpose** → the client-side read surface for the container list: what the live channel has
delivered, with no request and no clock of its own.

## Contract

- `useContainers(): { containers: ContainerSummary[], loaded: boolean, error?: string, refresh: ()
  => void }`
  - `containers` is what the channel last delivered, and an empty list until it has delivered one.
  - `loaded` becomes `true` on the first list delivered, and goes back to `false` when the channel
    says the values held were discarded.
  - `error` carries a failure while the channel is not delivering, and is cleared as soon as it is.
  - `refresh()` asks for the channel again when it is not delivering, and does nothing when it is:
    the list arrives on the channel, so there is nothing to re-read.

## Rules and invariants

- **It holds no clock and makes no request**: the list arrives when the server pushes it, so a
  container started outside the application appears without the operator doing anything, and a
  screen left open for an hour costs the server nothing beyond the one channel
  (…-multiplexed_sse/REQ-8, /REQ-17, /REQ-39).
- **A list delivered again unchanged replaces nothing**: the reference in hand is kept, so the cards
  under it are not redrawn and the operator's selection, search and scroll stay as they were. The
  rule lives in the pushed-value store this hook reads through
  (…-multiplexed_sse/REQ-12).
- Nothing is re-read on a context switch: the server discards what it holds, says so on the channel,
  and the new context's list arrives on it.
- The manual reload reaches this list on the channel like any other change; what makes the refresh
  control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- Containers client (`ContainerSummary`, the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-48
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-8
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
