---
module: registries
component: useRegistries
type: frontend hook
---

# useRegistries

**Purpose** → the client-side read surface for the configured registries — what the live channel has
delivered — and the log in / log out it drives (REQ-85, REQ-87).

## Contract

- `useRegistries(): { registries: RegistrySummary[], loaded: boolean, error?: string, refresh: () =>
  void, logIn, logOut }`
  - `registries` is what the channel last delivered, and an empty list until it has delivered one.
  - `loaded` becomes `true` on the first inventory delivered, and goes back to `false` when the
    channel says the values held were discarded.
  - `error` carries a failure while the channel is not delivering, and is cleared as soon as it is.
  - `refresh()` asks for the channel again when it is not delivering, and does nothing when it is:
    the inventory arrives on the channel, so there is nothing to re-read.
  - `logIn({ host, username, secret }): Promise<RegistrySummary>` — rejects with the server's message.
  - `logOut(host): Promise<RegistrySummary>`.

## Rules and invariants

- **The hook holds no credential state of any kind** (REQ-87): the secret passed to `logIn` is
  forwarded to the server and kept nowhere — not in state, not in a ref, not in a cache.
- **It holds no clock and makes no request for the inventory**: it arrives when the server pushes it
  (…-multiplexed_sse/REQ-17, /REQ-33, /REQ-39).
- **An action re-reads nothing here**: the server marks the inventory changed as part of the
  operation, so a log in or a log out made through the application reaches the screen as the push
  that operation caused (…-multiplexed_sse/REQ-25).
- **What a change made outside the application costs**: a `docker login` or `docker logout` typed in
  a terminal is noticed within the server's own period — no daemon event covers it, the credential
  living in the local Docker configuration and the credential store, which publish nothing — and the
  push follows the reading at once, with no client period of its own added to it.
- A delivery that is not a list is treated as a failed read: it is reported, never shown, so no
  consumer is ever handed a non-list.
- **An inventory delivered again unchanged replaces nothing**: the reference in hand is kept, so the
  table under it is not redrawn. The rule lives in the pushed-value store this hook reads through
  (…-multiplexed_sse/REQ-12).
- Nothing is re-read on a context switch: the server discards what it holds, says so on the channel,
  and the new context's inventory — including which registries it treats as insecure — arrives on it
  (…-multiplexed_sse/REQ-24).
- The manual reload reaches this inventory on the channel like any other change; what makes the
  refresh control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- registries: Registries client (the actions, and `RegistrySummary` — the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-87
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-59
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
