---
batch: 2 · daemon-connectivity
feature: F2 — Daemon connectivity and live state
closed_req: [REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-110]
depends: [1]
---

# Batch 2 — Daemon connectivity and live state

Establishes the two channels to Docker (Engine API as primary, local CLI as complement), the live
event stream that makes every later screen self-updating, and the connection surface in the shell.

Visual reference: the header "Live · daemon events" pill and the "Daemon event stream" panel in
`.sdd/analysis/ui-mock/dashboard.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Connection/status primitives: live status pill variants (ok / degraded / unreachable), inline retry action, and a monospace timestamped stream surface for event lines with type and action emphasis. | REQ-9, REQ-10, REQ-12 | — |
| INT-2 | create | server, Docker access layer | Engine API client for the active context's endpoint (unix socket, SSH, TCP+TLS), with API-version negotiation, request/stream helpers and mapping of daemon errors to a typed shape that preserves the daemon's own message. | REQ-9, REQ-10, REQ-13 | — |
| INT-3 | create | server, Docker access layer | Local CLI runner for `docker`, `docker compose` and `docker buildx`: presence and version detection, execution against the active context, streamed stdout/stderr, exit code, cancellation. | REQ-110 | — |
| INT-4 | create | server, connectivity area | Connection status service and endpoint: daemon reachability with the cause when it fails, negotiated Engine API version, CLI/plugin availability with the capabilities that are unavailable without them. | REQ-9, REQ-10, REQ-13, REQ-110 | INT-2, INT-3 |
| INT-5 | create | server, events area | Subscription to the daemon event stream, re-published to the client as a live stream (object type, action, actor, timestamp) with reconnection and backoff, and a short in-memory backlog for late subscribers. | REQ-11, REQ-12 | INT-2 |
| INT-6 | modify | `server/src/index.ts` | Mount the connectivity and event routes/streams alongside the existing `GET /health`, which is kept unchanged. | REQ-9, REQ-12 | INT-4, INT-5 |
| INT-7 | create | client, data-access layer | Typed client for the server API plus the live-event subscription, with the invalidation rules that make the views showing an affected object re-read it automatically when an event arrives. | REQ-11, REQ-12 | INT-6 |
| INT-8 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Bind the header status pill, the unreachable state (cause + retry, screens stay usable) and the daemon event stream panel to the real connection and event data; surface the negotiated API version and the CLI availability report. | REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-110 | INT-1, INT-7 |
