---
module: contexts
component: Active-context broadcast
type: frontend data client
---

# Active-context broadcast

**Purpose** → the client-side announcement that another daemon is now the active one, so every
cached view drops what it read from the daemon left behind instead of showing it until its next
poll (REQ-93).

## Contract

- `notifyActiveContextChanged(): void` — announces the switch to every subscriber, synchronously.
- `subscribeToActiveContextChange(listener): () => void` — registers a listener; returns its
  unsubscribe function.

## Rules and invariants

- The broadcast is announced by the switch itself (the contexts hook, once the server confirms it),
  never by a view: a view that fails to re-read cannot suppress the announcement for the others.
- Subscribers are the cached views of the application — container, image, volume, network, compose,
  builder and build-cache lists, the connection status and the daemon information. Each re-reads
  from the server, which by then answers for the new daemon.

## Requirements served

- plan-docker_management_app/REQ-93
