---
batch: batch-stats-gate-on-a-websocket
feature: The gate on per-container stats sampling is held by a WebSocket, proved live by ping/pong, and re-established by the client when it drops
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21]
depends: []
---

# batch-stats-gate-on-a-websocket

The connection that decides whether the daemon is sampled for per-container figures stops being an
SSE stream and becomes a WebSocket. The gate itself does not change: opening acquires one unit of
demand, closing releases one, zero to one starts the sampler and one to zero stops it. Two things do
change. The liveness probe written by hand — a comment line every sampling interval — becomes the
protocol's ping/pong. And the client gains a reconnection, because EventSource re-opened a dropped
connection on its own and WebSocket does not.

Nothing the operator sees changes. The demand registry, the sampling interval, the staleness bound
and the *no sample* state are out of scope.

## What this batch builds

- **Container stats subscription endpoint (WebSocket)** — the connection a consumer holds open to
  prove it is being shown the sampled figures. It replaces the REST/SSE endpoint of the same name,
  keeps its address, and is the only new component of this batch.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | backend, containers area | The WebSocket endpoint that holds the gate. One unit of demand is acquired when the connection is established and released once when it ends, however it ended. Neither side sends a frame. | REQ-1, REQ-2, REQ-3, REQ-14, REQ-17 | — |
| INT-2 | create | backend, containers area | Liveness on that endpoint: ping on a period, and close the socket and release its unit when no pong arrives within the bound. Both figures go through the server's `cadence()`. | REQ-9, REQ-10, REQ-11 | INT-1 |
| INT-3 | modify | `server/src/index.ts` | Offer an upgrade the sessions handler did not claim to the gate endpoint, before the socket is destroyed. The hook itself, and what it refuses, stay as they are. | REQ-5 | INT-1 |
| INT-4 | modify | `server/src/containers/containers-routes.ts` | Remove `GET /api/containers/stats/subscription` with its `: subscribed` and `: alive` writes and the interval behind them. `StatsDemandRegistry` is not touched. | REQ-7 | INT-5 |
| INT-5 | modify | `client/src/data/use-stats-subscription.ts` | Hold the gate on a WebSocket to the same address, built from the page's own origin and protocol. Same open and close conditions as today, and still no unload signal of any kind. | REQ-1, REQ-4, REQ-6, REQ-8, REQ-19 | INT-1, INT-3 |
| INT-6 | modify | `client/src/data/use-stats-subscription.ts` | Reopen a connection that ended without the hook asking, spaced out and capped, for as long as the screen still needs the figures. A close the hook asked for is never followed by a reopen, and nothing is resumed. | REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-18, REQ-19 | INT-5 |
| INT-7 | modify | `server/test/unit/stats-subscription-endpoint.test.ts` | Rewrite against the WebSocket endpoint. Keep proving the demand count returns to zero, and add the socket that stops answering being closed and released. | REQ-20 | INT-2 |
| INT-8 | modify | `client/test/unit/use-stats-subscription.test.tsx`, `client/test/unit/stats-subscription-consumers.test.tsx` | Drive a WebSocket instead of an EventSource. Add the reconnection rules: a drop reopens, a close the hook asked for does not, and the spacing grows and is capped. | REQ-20 | INT-6 |
| INT-9 | modify | `client/e2e/containers-stats-gate.spec.ts` | The gate recorder wraps `WebSocket` instead of `EventSource`, filtered on the same address. Every scenario of the file stays, none softened and none given a longer budget. | REQ-20 | INT-6 |
| INT-11 | modify | `client/e2e/container-stats-processes.spec.ts` | Add a `WebSocket` recorder for the gate **beside** the `EventSource` one, which stays for the per-container stream, and point `heldGateSubscriptions()` at it. The two `__statsStreams` url assertions are true by construction of that recorder's own filter: replace them with ones that can fail. | REQ-20 | INT-6 |
| INT-10 | create | the check trees (`client/e2e/`, `server/test/`) | The drop and the return: a screen showing the figures loses its connection and the figures resume with the operator doing nothing. Server-side, the count released by the dropped connection is proved to be replaced by the reconnection's own. | REQ-21 | INT-6 |

## Human acceptance

### Scenario: Measured figures keep arriving on the Containers screen

- REQ → REQ-1, REQ-2, REQ-3, REQ-5, REQ-6, REQ-8, REQ-9, REQ-11, REQ-20
- Given → a container is running and the operator opens the Containers screen
- When → the operator watches its card for a minute
- Then → CPU and memory keep showing measured figures, changing as often as they do today

### Scenario: Leaving the screen and coming back is served a fresh figure at once

- REQ → REQ-4, REQ-7, REQ-17
- Given → the operator is on the Containers screen and the cards show measured CPU and memory
- When → the operator moves to Volumes & networks, waits more than half a minute, and comes back to Containers
- And → the operator presses nothing else
- Then → the cards show a fresh measured figure within a few seconds, not after a full sampling interval

### Scenario: The figures come back on their own after the server restarts

- REQ → REQ-12, REQ-14, REQ-15, REQ-16, REQ-18, REQ-21
- Given → the operator is on the Containers screen and the cards show measured CPU and memory
- When → the server is restarted while the operator does nothing
- Then → the cards go back to showing measured figures on their own, with nothing pressed and no screen change

### Scenario: A tab left in the background is asked nothing, and coming back shows figures again

- REQ → REQ-4, REQ-13, REQ-19
- Given → the operator is on the Containers screen and the cards show measured CPU and memory
- When → the operator switches to another browser tab, waits more than half a minute, and comes back
- Then → the cards show a fresh measured figure within a few seconds

### Scenario: A window that is killed stops holding the sampling open

- REQ → REQ-10, REQ-19
- Given → one window is on the Containers screen showing measured CPU and memory, and no other window of the application is open
- When → the operator force-quits the browser, waits half a minute, then opens the application again on the Containers screen
- Then → the cards show *no sample* before their first fresh figure arrives
