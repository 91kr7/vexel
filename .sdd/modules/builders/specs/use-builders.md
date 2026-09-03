---
module: builders
component: useBuilders
type: frontend hook
---

# useBuilders

**Purpose** → the client-side read surface for the buildx builder listing — what the live channel has
delivered — and the create/remove/select-active it drives.

## Contract

- `useBuilders(): { builders: BuilderSummary[], loaded: boolean, error?: string, refresh: () => void,
  create, remove, use }`
  - `builders` is what the channel last delivered, and an empty list until it has delivered one.
  - `loaded` becomes `true` on the first listing delivered, and goes back to `false` when the channel
    says the values held were discarded.
  - `error` carries a failure while the channel is not delivering, and is cleared as soon as it is.
  - `refresh()` asks for the channel again when it is not delivering, and does nothing when it is:
    the listing arrives on the channel, so there is nothing to re-read.
  - `create(input): Promise<BuilderSummary>`, `remove(name): Promise<void>`,
    `use(name): Promise<BuilderSummary>` — failures propagate to the caller (never swallowed) so the
    screen can report them.

## Rules and invariants

- **It holds no clock and makes no request for the listing**: it arrives when the server pushes it
  (…-multiplexed_sse/REQ-17, /REQ-33, /REQ-39).
- **An action re-reads nothing here**: the server marks the inventory changed as part of the
  operation, so what the operator just did reaches the listing as the push that operation caused
  (…-multiplexed_sse/REQ-25).
- **A listing delivered again unchanged replaces nothing**: the reference in hand is kept, so the
  table under it is not redrawn and what the operator selected stays as it was. The rule lives in the
  pushed-value store this hook reads through (…-multiplexed_sse/REQ-12).
- Nothing is re-read on a context switch: the server discards what it holds, says so on the channel,
  and the new context's listing arrives on it (…-multiplexed_sse/REQ-24).
- The manual reload reaches this listing on the channel like any other change; what makes the refresh
  control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- builders: Builders client (the actions, and `BuilderSummary` — the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
