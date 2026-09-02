---
module: live-channel
component: Live channel client
type: frontend data client
---

# Live channel client

**Purpose** → the browser's single connection to `GET /api/live`: it opens one channel per window,
routes each message by what it names, and says whether it is delivering.

## Contract

- `subscribeToDaemonEvents(listener) → () => void` — every daemon event, the server's own
  `DaemonEvent` shape, `actorId` included.
- `subscribeToPushedValues(listener) → () => void` — every value the channel delivers, as
  `{ name, value }`.
- `subscribeToChannelDiscard(listener) → () => void` — the server says the values it held are gone.
- `subscribeToChannelDelivery(listener) → () => void` — told `true` when the channel starts
  delivering and `false` when it stops.
- `isChannelDelivering() → boolean` — whether it is delivering right now; `false` until the first
  message channel is open.
- `awaitReloadEnd() → Promise<void>` — resolves on the next end-of-reload message. The values that
  reload changed are written before it on the same channel, so resolving means they have been
  delivered. On a channel that is **not** delivering it resolves at once, and a wait already parked
  resolves the moment the channel stops delivering: no message will come, and the interface already
  says the channel is down.
- `reconnectLiveChannel() → void` — closes the channel and opens it again; what an operator told the
  channel is not delivering asks for.

## Rules and invariants

- One connection per window, whatever the number of subscribers, opened on the first subscription
  and never a second time.
- It reconnects on its own when the channel drops, and reports that it is not delivering meanwhile.
- `awaitReloadEnd()` must be parked **before** the reload is asked for: the message can arrive before
  the endpoint answers, and a wait raised afterwards would miss it.
- **No wait outlives the channel it waits on**: a caller parked on a channel that goes down would
  stay parked for as long as it stayed down (…-multiplexed_sse/REQ-11, /REQ-18).
- It knows no Docker vocabulary and holds no value: what arrives is routed, not kept.

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-3
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-9
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-10
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-23
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-26
