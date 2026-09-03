---
module: contexts
component: Active-context broadcast
type: frontend data client
---

# Active-context broadcast

**Purpose** → the client-side announcement that another daemon is now the active one, so every view
that reads on demand drops what it read from the daemon left behind instead of showing it until it
is asked again (REQ-93). The values the live channel carries need no announcement: the server
discards them and says so on the channel.

## Contract

- `notifyActiveContextChanged(): void` — announces the switch to every subscriber, synchronously.
- `subscribeToActiveContextChange(listener): () => void` — registers a listener; returns its
  unsubscribe function.

## Rules and invariants

- The broadcast is announced by the switch itself (the contexts hook, once the server confirms it),
  never by a view: a view that fails to re-read cannot suppress the announcement for the others.
- Subscribers are the views that read on demand — the connection status, the daemon information, the
  disk-usage breakdown, the coverage matrix and the registry repository browsing. Each re-reads from
  the server, which by then answers for the new daemon. The listings are not among them: they arrive
  on the live channel, which the server tells that the values it held are gone
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-24).

## Requirements served

- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-24
