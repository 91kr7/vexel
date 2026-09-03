---
module: containers
component: Container stats subscription endpoint
type: WebSocket endpoint
---

# Container stats subscription endpoint

**Purpose** → the connection a client holds open for as long as it is being shown the sampled
per-container figures; while at least one is held the daemon is sampled, and when the last one ends
it is not.

## Contract

- `WS /api/containers/stats/subscription` → a connection held open, admitted on the same HTTP
  `upgrade` hook that serves the interactive sessions.
  - on the handshake completing: one consumer is registered (`StatsDemandRegistry`), so a gate that
    was closed is sampled at once rather than at the next interval — a connection re-established
    after a drop is served exactly as one opened by the operator returning to the screen.
  - while open: **no frame carries application data in either direction**. The client sends nothing,
    and the only frames the server sends are the protocol's own pings.
  - the server pings **every 10 seconds** and closes a connection that has not answered with a pong
    within a further **5 seconds** (both multiplied by the process's timing scale).
  - on close: the consumer is released, **once**, whether the client closed the connection, the
    server closed it for silence, the browser was killed, the process was force-quit or the network
    was pulled.
- An upgrade request for any other address is **not claimed**, so nothing else on the server becomes
  reachable through it.

## Rules and invariants

- **Liveness is the protocol's ping/pong, not a hand-written write.** A connection whose other end
  has vanished without closing never answers a ping and is closed and released within the ping
  period plus its timeout, so a phantom consumer cannot hold the gate open indefinitely.
- One connection registers exactly one consumer and releases exactly one, however many times the
  socket reports itself closed or errored.
- The endpoint holds no state of its own: the count lives in `StatsDemandRegistry`, and this is one
  of possibly many holders of it.
- No HTTP request stays open for as long as the gate is held: past the handshake the connection is
  a WebSocket and occupies none of the six HTTP connections a browser allows per origin.
- Nothing about `GET /api/containers` changes: the figures still travel in the container list, and a
  client that never opens this connection still gets the list at its own cadence — with no sampled
  figures, since nobody is being sampled for.

## Dependencies

- containers: StatsDemandRegistry
- timing-scale: the server's timing scale (`cadence`)

## Requirements served

- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-1
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-2
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-3
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-5
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-8
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-9
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-10
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-11
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-14
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-17
