---
slug: docker_management_app-containers_card_view-stats_gate_websocket
date: 2026-09-03
spec: .sdd/analysis/docker_management_app-containers_card_view-stats_gate_websocket.md
status: validated
---

# Requirements — the stats gate moves to a WebSocket

The connection that gates per-container stats sampling stops being an SSE stream and becomes a
WebSocket. The gate's semantics, the demand registry, the sampling cadence and everything the
operator sees stay as they are. One behaviour is new: the client must re-establish a connection that
drops, because WebSocket does not do it by itself.

Names confirmed against the project before writing: the demand registry is `StatsDemandRegistry`
(`server/src/containers/stats-demand-registry.ts`), the SSE endpoint being replaced is the
"Container stats subscription endpoint" in `server/src/containers/containers-routes.ts`, and the
client holds the gate with the `useStatsSubscription` hook.

## Feature 1 — The gate is held by a WebSocket

| ID | Requirement |
|----|-------------|
| REQ-1 | A WebSocket connection holds the gate on per-container stats sampling, in place of the SSE stream that holds it today. |
| REQ-2 | The connection carries no application data in either direction. Its existence is the whole signal. |
| REQ-3 | Opening the connection acquires one unit of demand and closing it releases one: zero to one starts the sampler, one to zero stops it. |
| REQ-4 | The client opens the connection while a screen showing the sampled figures is displayed, and closes it on a screen change and when the tab is hidden. This is unchanged from today. |
| REQ-5 | The server admits the new upgrade on the dispatcher that already serves the exec/attach sessions, under the same rules. Nothing else on the server becomes reachable. |
| REQ-6 | The gate works in the single process that serves the product and in the two-process development setup behind the Vite proxy. |
| REQ-7 | The SSE endpoint that holds the gate today is removed. Two gates must not stand side by side. |
| REQ-8 | Once the connection is established, the gate occupies none of the six HTTP connections a browser allows per origin. No HTTP request stays open for as long as the gate is held. |

## Feature 2 — Liveness comes from the protocol

| ID | Requirement |
|----|-------------|
| REQ-9 | The server proves the connection is live with the WebSocket protocol's ping/pong, and writes nothing to the connection by hand for that purpose. |
| REQ-10 | The server closes a connection that stops answering within a stated bound, and releases its unit of demand. A connection that died without closing must not hold the sampler open. |
| REQ-11 | The ping period and the timeout that follows it scale with `VEXEL_TIMING_SCALE`, like the cadences they replace. |

## Feature 3 — The client re-establishes a dropped connection

| ID | Requirement |
|----|-------------|
| REQ-12 | The client re-establishes a connection that drops while the screen still needs the figures, with no action from the operator. |
| REQ-13 | The client does not reconnect a connection it closed on purpose: a screen change, a hidden tab or a closed window. |
| REQ-14 | Reconnection resumes nothing: no cursor, no missed state, no replay. A new connection is a new unit of demand. |
| REQ-15 | Reconnection attempts space out and the spacing is capped, so a restarting server is not met by every open window at once. |
| REQ-16 | Reconnection never gives up on its own. It stops when the screen stops needing the figures, which is the condition that closes the connection normally. |
| REQ-17 | A sample is taken promptly when the gate opens again after a reconnection, as it is when the operator returns to the screen. |
| REQ-18 | A drop shorter than the staleness bound leaves no trace on screen. A longer one shows the *no sample* state the cards already have. |
| REQ-19 | Nothing is signalled at unload: no `beforeunload`, no `pagehide`, no beacon. A connection the browser drops on close is the gate releasing itself. |

## Feature 4 — The checks follow the transport

| ID | Requirement |
|----|-------------|
| REQ-20 | The checks covering the gate are rewritten against the WebSocket transport, and none is weakened. A check on the gate proves the unit of demand was released, not that figures stopped appearing. |
| REQ-21 | A check proves that sampling resumes after the connection drops, with no action from the operator. |

> **REQ-19 restates a prohibition the reference analysis already set**, so that the batch that
> rewrites the client's gate does not reintroduce an unload signal while adding reconnection.
>
> **What does not change**, and is therefore not a requirement here: the demand registry itself, the
> sampling interval, the staleness bound, the *no sample* presentation, the Stats tab of the
> container detail, and the multiplexed SSE channel carrying the list values.
