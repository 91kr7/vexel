---
batch: batch-containers-arrive-by-push
feature: The live channel exists, carries every value the server holds, and the container listing arrives on it
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-26, REQ-32, REQ-35, REQ-40]
depends: []
---

# batch-containers-arrive-by-push

The whole mechanism, proven on one value. The server gains a channel that carries the daemon events
and every value it holds; the browser gains the one connection that reads it; the container listing
stops polling and reads from it. The other eleven values are already published here — the batches
after this one give each of them a consumer in the browser.

**The name.** "The live channel" is this product's name for the one SSE connection the analysis
calls "one SSE channel". The CLI channel and the API channel keep their existing meaning: they are
the two ways the server reaches Docker.

## What this batch builds

- **The live channel** — one SSE endpoint. A window opens exactly one, and it carries the daemon
  events and every value the refresh cache holds.
- **The held-value publisher** — turns a value the cache has just stored into a message for every
  open channel, and holds the cache's demand while at least one channel is open.
- **The channel client** — the browser's single connection to that endpoint: it reconnects on its
  own, routes each message by the value it names, and says whether it is delivering.
- **The pushed-value store** — where the client keeps what the channel delivered, so a screen reads
  from it instead of asking the server.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/refresh-cache/refresh-cache.ts` | Announce every value a kind stores, to whoever subscribes: the key, the value and its read time. Announce a discard too. The announcement is made after the value is stored and starts no read. | REQ-4, REQ-7 | — |
| INT-2 | modify | `server/src/refresh-cache/refresh-cache.ts` | Let a caller hold a kind's demand without reading it, and release it. A kind with a live holder never expires; when the last holder releases, it expires as it does today. | REQ-13, REQ-14, REQ-15 | — |
| INT-3 | create | server, a new area for the live channel, beside the events and refresh-cache areas | The held-value publisher: it subscribes to INT-1 and writes each stored value to every open channel. A value whose message equals the last one sent on that channel is not sent again. | REQ-4, REQ-6, REQ-12 | INT-1 |
| INT-4 | create | server, the live-channel area | The publisher holds the demand of every registered kind while at least one channel is open, and releases it when the last one closes. One set of holds serves every channel. | REQ-13, REQ-14, REQ-15, REQ-16 | INT-2, INT-3 |
| INT-5 | create | server, the live-channel area | On a discard — the active context changed — the publisher tells every open channel that the held values are gone, then sends each new value as it arrives. | REQ-2, REQ-4 | INT-3 |
| INT-6 | create | server, the live-channel area | The channel endpoint: one SSE stream carrying the daemon events and the held values, every message naming which value it carries. On open it writes each value the server holds, and nothing for one not held yet. | REQ-1, REQ-2, REQ-3, REQ-5, REQ-8, REQ-32, REQ-40 | INT-3 |
| INT-7 | modify | `server/src/events/events-routes.ts` | Retire `GET /api/events/stream`. The daemon events travel on the channel of INT-6, with the same backlog and the same `Last-Event-ID` resumption; a value message carries no `id:` line. | REQ-1, REQ-26 | INT-6 |
| INT-8 | modify | `server/src/index.ts` | Mount the live-channel router where the events router was mounted: after `/health`, before the client build and the history fallback. | REQ-1 | INT-6, INT-7 |
| INT-9 | create | client, the data layer (`client/src/data/`) | The channel client: opens the one connection, routes each message by the value it names, reconnects on its own when it drops, and reports whether it is delivering. | REQ-1, REQ-3, REQ-9, REQ-10 | INT-6 |
| INT-10 | create | client, the data layer | The pushed-value store: holds what the channel delivered, keeps a value sent again unchanged from replacing what is in hand, and drops everything when the channel says the held values were discarded. | REQ-10, REQ-12 | INT-9 |
| INT-11 | modify | `client/src/shell/services/EventStreamService.tsx` | Read the daemon events from the channel client instead of the event-stream client. The feed keeps the same entries, the same order and the same de-duplication. | REQ-26 | INT-9 |
| INT-12 | modify | `client/src/data/event-stream.ts` | Remove it. The channel client is the browser's one connection, and this had no other caller. | REQ-1 | INT-11 |
| INT-13 | modify | `client/src/data/use-containers.ts` | Read the container listing from the pushed-value store. Drop the poll and its period figure. The first read, the loaded flag, the failure reporting and the reload signal behave as today. | REQ-8, REQ-17, REQ-20, REQ-39 | INT-10 |
| INT-14 | modify | `client/src/shell/services/ConnectionStatusService.tsx` | While the channel is not delivering, report the daemon unreachable with a cause, through the state this service already exposes. Nothing is added to any screen. | REQ-11, REQ-35 | INT-9 |
| INT-15 | modify | `client/src/shell/RefreshControl.tsx` | End the control when the channel has delivered what the reload read, not when `POST /api/refresh` answers. It stays busy until then and still reports the outcome. | REQ-23, REQ-34 | INT-10 |
| INT-16 | create | the check trees (`server/test/api/`, `client/e2e/`) | Drive the channel: the current values on open, one value pushed on a change, a quiet host sending nothing again, a drop reported and recovered, and the container list following the host with no clock. | REQ-4, REQ-5, REQ-6, REQ-13, REQ-16 | INT-13, INT-14 |

## Human acceptance

### Scenario: The container list follows the host with no clock in the browser

- REQ → REQ-8, REQ-13
- Given → the Containers screen has been open and untouched for more than a minute
- When → the operator starts a container from a terminal, outside the application
- Then → the new container appears in the list without the operator doing anything

### Scenario: A channel opened against the server carries every value it holds

- REQ → REQ-1, REQ-2, REQ-3, REQ-5, REQ-6, REQ-7, REQ-32
- Given → the server is running and has been serving a window
- When → a channel is opened against it
- Then → the response carries the current value of each of the twelve values the server holds, every message naming which value it is, and the daemon events on the same connection

### Scenario: The first window after the server starts

- REQ → REQ-40
- Given → the server has just started and holds nothing
- When → the operator opens the application on the Containers screen
- Then → the screen shows the loading state it shows today, and fills as soon as the first values arrive

### Scenario: A quiet host sends nothing again

- REQ → REQ-4, REQ-12
- Given → the Containers screen is open with a row selected and the list scrolled
- When → nothing happens on the host for a minute
- Then → the selection and the scroll position are exactly where the operator left them

### Scenario: A lost connection is told, and recovers on its own

- REQ → REQ-9, REQ-10, REQ-11, REQ-35
- Given → the application is open on the Containers screen
- When → the connection to the server is lost
- Then → the interface shows the daemon as unreachable, with the cause it already shows, and nothing new appears on the screen

### Scenario: The screens are current again after the connection returns

- REQ → REQ-10
- Given → the connection to the server has been lost and containers have been started and stopped meanwhile
- When → the connection returns
- Then → the list shows the host as it is now, with the operator doing nothing

### Scenario: Closing one window does not stop another

- REQ → REQ-14, REQ-15, REQ-16
- Given → two windows of the application are open on the Containers screen
- When → the operator closes one of them
- Then → the other keeps following the host without the operator doing anything

### Scenario: The Dashboard's recent events still fill

- REQ → REQ-26
- Given → the Dashboard is open
- When → the operator starts a container from a terminal
- Then → the event appears in the recent-events panel exactly as it does today
