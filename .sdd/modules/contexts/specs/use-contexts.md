---
module: contexts
component: useContexts
type: frontend hook
---

# useContexts

**Purpose** → the client-side read surface for the Docker context inventory — what the live channel
has delivered — and the create/remove/select-active it drives.

## Contract

- `useContexts(): { contexts: ContextSummary[], active?, loaded: boolean, error?: string, refresh: ()
  => void, create, remove, use }`
  - `contexts` is what the channel last delivered, and an empty list until it has delivered one.
  - `active` is the context marked active in that inventory; `undefined` until one has been
    delivered, or when none is marked.
  - `loaded` becomes `true` on the first inventory delivered, and goes back to `false` when the
    channel says the values held were discarded.
  - `error` carries a failure while the channel is not delivering, and is cleared as soon as it is.
  - `refresh()` asks for the channel again when it is not delivering, and does nothing when it is:
    the inventory arrives on the channel, so there is nothing to re-read.
  - `create(input): Promise<ContextSummary>`, `remove(name): Promise<void>`,
    `use(name): Promise<ContextSummary>` — failures propagate to the caller (never swallowed) so the
    screen can report them.
  - `use(name)` announces the switch on the active-context broadcast, once the server confirms it —
    never before, and never on failure.

## Rules and invariants

- **It holds no clock and makes no request for the inventory**: it arrives when the server pushes it,
  so a `docker context` command run from a terminal reaches the screen with the operator doing
  nothing (…-multiplexed_sse/REQ-17, /REQ-33, /REQ-39).
- **An action re-reads nothing here**: the server marks the inventory changed as part of the
  operation, so what the operator just did reaches the screen as the push that operation caused
  (…-multiplexed_sse/REQ-25).
- **Every mounted instance reads the same delivery**, so the Contexts screen and the shell always
  name the same active context and count the same contexts, with no interval of disagreement between
  them. That no longer needs an announcement between instances: there is one store, and one channel
  feeding it.
- **A switch shows the new daemon and nothing of the old one**: the server discards every value it
  holds, says so on the channel, and this inventory — which is what reports *which* context is active
  — arrives again with the rest (…-multiplexed_sse/REQ-24). The active-context broadcast is still
  raised, for the views that read on demand and have nothing on the channel to wait for.
- A delivery that is not a list of contexts is treated exactly like a failed read — reported through
  `error`, never shown — so no consumer is ever handed something it cannot iterate.
- **An inventory delivered again unchanged replaces nothing**: the reference in hand is kept, so
  nothing is redrawn. The rule lives in the pushed-value store this hook reads through
  (…-multiplexed_sse/REQ-12).
- The manual reload reaches this inventory on the channel like any other change; what makes the
  refresh control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- contexts: Contexts client (the actions, and `ContextSummary` — the shape the channel delivers),
  Active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-24
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
