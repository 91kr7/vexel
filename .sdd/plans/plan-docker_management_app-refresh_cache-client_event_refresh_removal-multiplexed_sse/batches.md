---
slug: docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse
date: 2026-09-02
spec: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse.md
status: validated
---

# Batches — one channel pushes the values the server holds

Three batches, in order. Each converts values and is verifiable on its own. The first builds the
channel and puts one listing on it; the second puts the other listings on it; the third puts the
connection status on it and takes away the last browser clock.

**The name.** The analysis says "one SSE channel". This product already calls two other things a
channel — the CLI channel and the API channel, the two ways the server reaches Docker
(module `raw-console`). So the thing built here is the **live channel**: the one connection from the
browser to the server. The two Docker channels keep their meaning.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| `batch-containers-arrive-by-push` | The live channel exists, carries every value the server holds, and the container listing arrives on it | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-26, REQ-32, REQ-35, REQ-40 | — | implemented | The container list follows the host with no clock in the browser |
| `batch-every-listing-arrives-by-push` | Every other listing the server holds arrives on the live channel | REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33, REQ-34 | `batch-containers-arrive-by-push` | todo | Every screen follows the host with nothing to press |
| `batch-connection-status-arrives-by-push` | The connection status arrives on the live channel, and the browser holds no clock at all | REQ-17, REQ-18, REQ-19, REQ-20, REQ-36, REQ-37, REQ-38, REQ-39 | `batch-every-listing-arrives-by-push` | todo | The daemon coming back is noticed with no clock in the browser |

## Assumptions and decisions

- **The twelve values are the twelve kinds registered with the refresh cache**, confirmed against the
  code: containers, images, volumes, networks, compose projects, builders, build cache, contexts,
  disk usage, connection status, plugins, registries. The analysis calls the ninth "volume sizes",
  which is how the volumes listing uses it: it reads the sizes out of the held disk accounting
  (`server/src/volumes/volumes-service.ts`). The census is therefore right, and `disk-usage` is its
  name in the code.
- **The disk accounting travels on the channel and feeds no new screen.** The Dashboard's overview
  figures and the disk-usage view of System & prune keep the triggers they have (REQ-27, REQ-29), so
  the value is pushed and nothing on screen changes because of it.
- **A value is pushed when the message would differ from the last one sent on that channel**, not
  when the cache's own `differs` says so. What "different" means to a kind that derives from another
  is that kind's declaration and stays as it is; what goes on the wire is the channel's own concern.
  One mechanism then serves both "push only on change" (REQ-4) and "a resend replaces nothing"
  (REQ-12), and no kind has to declare anything new.
- **The live channel replaces `GET /api/events/stream`.** The daemon events keep their backlog and
  their resumption on the new endpoint. Two endpoints would leave a second connection available for
  a caller to open, which is the thing this step exists to prevent.
- **A value message carries no SSE `id:` line.** Only daemon events do, so `Last-Event-ID` on a
  reconnection keeps naming the last event delivered and resumption is unaffected.
- **The channel is served by a new server area**, not by the events area. The events area's own
  endpoint would have to depend on the refresh cache, and the refresh cache already depends on the
  events area for the daemon events that mark a kind due.
- **The manual refresh control ends when the channel has delivered what the reload read**, not when
  `POST /api/refresh` answers. The response and the channel are two connections, so the answer
  arriving first says nothing about the screen.
- **Nothing is done about the browser's own retry policy.** The channel reconnects the way the daemon
  event stream reconnects today.

## Departures

- **Volumes and networks go back to being refreshed while any window is open.**
  `plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40` and `/REQ-41` made
  both read only while the Volumes & networks screen was on screen. The live channel holds the demand
  of every held value while it is open (REQ-13), and the analysis refuses a protocol where the client
  says which values its screen needs. So both are read again on the server's own period whenever a
  window is open.
  This is the analysis's own decision — "Volumes and networks are in ... The daemon holds them, which
  is what defines the set" — and not a decision taken here. The earlier plan is left exactly as it
  is: it records what its own batch built.

## Coverage check

- **Every REQ is served by at least one INT.** REQ-1 … REQ-40 all appear in the `REQ` column of at
  least one intervention across the three batch files.
- **Every INT serves at least one REQ.** No enabling intervention is declared: every one of them
  carries at least one requirement.
- **REQs completed across several batches**, with the batch each one closes in:
  - REQ-17, REQ-20, REQ-39 — a clock and a cadence go with each listing converted, in all three
    batches. They **close in `batch-connection-status-arrives-by-push`**, with the last poll.
  - REQ-21 — the event-stream client goes in the first batch, `useKeptReading` loses its polled
    callers in the second, the connectivity client goes in the third. **Closes in
    `batch-connection-status-arrives-by-push`**.
  - REQ-23, REQ-24, REQ-25, REQ-33, REQ-34 — the manual refresh control, the context switch and the
    re-read after an action are reworked for the container listing in the first batch and for every
    other listing in the second. **Close in `batch-every-listing-arrives-by-push`**.
  - REQ-36, REQ-37, REQ-38 — each batch carries the checks for what it converted. **Close in
    `batch-connection-status-arrives-by-push`**, the batch after which no poll is left to drive.
- **REQ-2 closes in the first batch**, not the last: the publisher carries all twelve values from the
  moment it exists. What the later batches add is a consumer in the browser for each of them.
