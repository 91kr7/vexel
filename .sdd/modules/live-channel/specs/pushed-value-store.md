---
module: live-channel
component: Pushed value store
type: frontend data client
---

# Pushed value store

**Purpose** → where the client keeps what the live channel delivered, so a screen reads from it
instead of asking the server.

## Contract

- `usePushedValue<T>(name) → T | undefined` — what the channel last delivered for `name`, and
  `undefined` while it has delivered none; the caller re-renders whenever the channel delivers a
  different value for that name.

## Rules and invariants

- A value delivered again unchanged **replaces nothing**: the reference in hand is kept, so nothing
  re-renders and what the operator has opened, typed, selected or scrolled to stays as it was. This
  holds for a reconnection too, where the server writes every value again on a channel that has been
  sent none.
- When the channel says the values held are gone, everything is dropped and every reader is told:
  a reader is back to having been delivered nothing, exactly as before the first delivery.
- It subscribes to the channel on first use, and once.
- It knows no Docker vocabulary: a value is whatever arrived under that name.

## Dependencies

- Live channel client

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-10
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
