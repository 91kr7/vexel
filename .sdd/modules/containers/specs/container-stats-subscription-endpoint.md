---
module: containers
component: Container stats subscription endpoint
type: REST endpoint
---

# Container stats subscription endpoint

**Purpose** → the connection a client holds open for as long as it is being shown the sampled
per-container figures; while at least one is held the daemon is sampled, and when the last one ends
it is not.

## Contract

- `GET /api/containers/stats/subscription` → a connection held open, `200`,
  `Content-Type: text/event-stream`, `Cache-Control: no-cache`.
  - on open: one consumer is registered (`StatsDemandRegistry`) and the client is written to at
    once, so the response is observably open before anything else happens.
  - while open: the server writes to the connection **every 10 seconds** (the sampling interval, which the
    process's timing scale multiplies).
    The writes carry no figures — the container list is where those are read — and a client that
    ignores them entirely behaves correctly.
  - on close: the consumer is released, **once**, whether the client closed the connection, the
    browser was killed, the process was force-quit or the network was pulled.
  - the client sends nothing at all: no call switches sampling on, and none announces a departure.

## Rules and invariants

- **The periodic write is the liveness proof, not a keep-alive.** A connection whose other end has
  vanished without closing fails on the next write and is released there — so a phantom consumer is
  discovered within about one sampling interval instead of holding the gate open indefinitely.
- One request registers exactly one consumer and releases exactly one, however many times the
  connection reports itself closed.
- The endpoint holds no state of its own: the count lives in `StatsDemandRegistry`, and this is one
  of possibly many holders of it.
- Nothing about `GET /api/containers` changes: the figures still travel in the container list, and a
  client that never opens this connection still gets the list at its own cadence — with no sampled
  figures, since nobody is being sampled for.

## Dependencies

- containers: StatsDemandRegistry, ContainersService (`STATS_SAMPLE_INTERVAL_MS`)

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-46
- plan-docker_management_app-containers_card_view/REQ-47
- plan-docker_management_app-containers_card_view/REQ-50
- plan-docker_management_app-containers_card_view/REQ-54
