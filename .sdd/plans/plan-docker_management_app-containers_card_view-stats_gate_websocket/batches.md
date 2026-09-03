---
slug: docker_management_app-containers_card_view-stats_gate_websocket
date: 2026-09-03
spec: .sdd/analysis/docker_management_app-containers_card_view-stats_gate_websocket.md
status: validated
---

# Batches — the stats gate moves to a WebSocket

One batch. The transport move and the reconnection ship together, by the human's decision of
2026-09-03: REQ-7 removes the SSE endpoint, so a batch that stopped before the reconnection would
leave the product with no fallback for the failure the spec names as its main risk. The production
work is small — one endpoint, one line in the upgrade dispatcher, one hook — and the checks are
rewritten once either way.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| `batch-stats-gate-on-a-websocket` | The gate on per-container stats sampling is held by a WebSocket, proved live by ping/pong, and re-established by the client when it drops | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21 | — | certified | Measured figures keep arriving on the Containers screen |

## Assumptions and decisions

- **The name does not change.** The component keeps being the *container stats subscription
  endpoint*, and the hook keeps being `useStatsSubscription`. Only its type changes, from a REST/SSE
  endpoint to a WebSocket endpoint. The demand registry already counts "subscriptions", so a second
  word for the same thing would cost more than it explains.
- **The address does not change either**: `/api/containers/stats/subscription`, reached by an HTTP
  upgrade instead of a `GET`. The address is free the moment the Express route goes, the upgrade
  dispatcher matches on pathname, and an upgrade never enters the middleware chain, so it meets
  neither the API's JSON `404` nor the interface's history fallback.
- **The demand is acquired when the connection is established, not when the upgrade arrives.** A
  handshake that fails must not leave a unit behind.
- **The ping period is the sampling interval (10 s), and the pong must arrive within the same
  figure.** Both go through the server's `cadence()`, so `VEXEL_TIMING_SCALE` moves them like the
  cadences they replace. The bound is chosen to keep today's discovery window: the SSE endpoint found
  a vanished consumer on its next periodic write, about one sampling interval. It also stays inside
  the staleness bound of three intervals, so a phantom consumer is released before the figures it was
  holding open would have been withheld anyway.
- **Reconnection spacing: 1 s, doubling, capped at 15 s, with no randomisation.** A jittered
  factor (0.5-1) was planned here to desynchronise windows dropped by the same event, such as a
  server restart. The human authorized dropping it on 2026-09-03: every open window still retries on
  the same deterministic schedule after a shared drop, so the spacing and the cap hold (REQ-15) but
  a restarting server is met by every window at once, later rather than sooner — a residual risk
  accepted rather than fixed. The first delay is far below the 30 s staleness bound, so a transient
  drop still leaves nothing on screen (REQ-18).
- **REQ-17 needs no new mechanism.** `acquireStatsDemand()` already takes a sample at once when the
  count rises from zero to one, so a reconnection that reopens the gate is served promptly by what is
  there. When another window holds the count above zero, the sampler never stopped and no new sample
  is owed.
- **The demand registry is not touched**, and neither is the sampling interval, the staleness bound
  or the *no sample* state. The spec puts all of them out of scope.
- **The two arrangements need no separate work.** The client builds the URL from the page's own
  origin and protocol, as the exec/attach session client already does, and the Vite dev proxy is
  configured with `ws: true`. The e2e suite drives the single-process form only, so the development
  arrangement stays a human acceptance, as `.sdd/.archi` records.

## Departures

- **Reconnection has no jitter.** The spec's constraint on REQ-15 asked for spacing that keeps a
  restarting server from being met by every open window at once; the plan met it with a randomised
  factor, never implemented. The delivered backoff is deterministic — 1 s doubling, capped at 15 s —
  so a shared drop still produces a synchronised, if bounded and decreasing, retry pattern. The human
  authorized dropping the randomisation on 2026-09-03, after the batch was already certified; REQ-15
  and this file's assumption were reworded to describe what ships, not what was planned.

## Coverage check

- **Every REQ is served by at least one INT.** REQ-1 … REQ-21 each appear in the `REQ` column of
  `batches/batch-stats-gate-on-a-websocket.md`, across its eleven interventions.
- **Every INT serves at least one REQ.** No enabling intervention is declared.
- **No REQ is split across batches**: there is one batch, and every requirement closes in it.
- Two pairs of interventions touch one point each, on purpose, and are ordered by `depends`: INT-1
  and INT-2 build the new endpoint (the gate, then the liveness), INT-5 and INT-6 rewrite the client
  hook (the transport, then the reconnection). Each half fails independently of the other.
- **The two end-to-end files are two interventions, not one**, because the work differs. INT-9's file
  instruments the gate alone, so its recorder changes transport. INT-11's file instruments the gate
  *and* the per-container stats stream, which stays SSE, so it gains a second recorder and keeps the
  first. Reviewed 2026-09-03.
