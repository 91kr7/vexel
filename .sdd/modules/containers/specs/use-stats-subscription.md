---
module: containers
component: useStatsSubscription
type: frontend hook
---

# useStatsSubscription

**Purpose** → declares, from a screen that displays the sampled per-container figures, that somebody
is being shown them — by holding the server's subscription connection open for exactly as long as
that is true.

## Contract

- `useStatsSubscription(): void` — no arguments, no result; the connection is the whole effect.
  - on mount, with the tab visible → opens a WebSocket to `/api/containers/stats/subscription` on
    the page's own host, `wss` when the page is `https` and `ws` otherwise, and keeps it open.
  - on unmount → closes it.
  - on the tab being hidden or backgrounded → closes it; on the tab becoming visible again → opens a
    new one.
  - nothing is sent on the connection and nothing arriving on it is read: the figures themselves
    keep arriving with the container list.
  - on a close the hook did not ask for → opens a new connection after a wait, and keeps trying for
    as long as the screen still needs the figures.

## Rules and invariants

- **A close the hook asked for is never followed by a reopen**: an unmount, a screen change or a
  hidden tab ends the gate and leaves it ended. Only a drop reopens.
- **The wait before a reopen grows and is capped**: 1 s after the first drop, doubling with each
  further attempt that does not reach an open connection, never above 15 s — so a restarting server
  is not met by every open window at once. A connection that opens resets the wait to its first
  value.
- **Reconnection never gives up on its own** and resumes nothing: there is no cursor, no missed
  state and no replay to resume: a new connection is simply a new unit of demand.
- **Nothing is signalled at unload**: no `beforeunload`, no `pagehide`, no `unload` and no beacon,
  here or anywhere else in the client. The correct outcome never depends on one of them firing — a
  page that is killed, force-quit, discarded or cut off simply stops answering the server's ping,
  and the server releases it on its own.
- The visibility handling is an **optimisation over a mechanism already correct without it**: it
  closes the gate sooner than the server's own discovery would, and never later.
- Exactly one connection is held per mounted caller, whatever the number of visibility changes and
  drops: a hidden-then-visible cycle leaves one connection, not two, and a reopen scheduled but not
  yet fired is dropped when the caller opens or closes on its own, so the server's count cannot
  drift upward across a session.
- Two screens using the hook at once are two consumers, which is ordinary: one of them leaving does
  not stop the sampling the other is reading.
- A drop shorter than the server's staleness bound leaves nothing on screen: the figures already
  held stay shown, and the *no sample* state appears only when a reading gets older than that bound,
  exactly as it does for any other reason.

## Dependencies

- containers: Container stats subscription endpoint

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-42
- plan-docker_management_app-containers_card_view/REQ-43
- plan-docker_management_app-containers_card_view/REQ-45
- plan-docker_management_app-containers_card_view/REQ-48
- plan-docker_management_app-containers_card_view/REQ-49
- plan-docker_management_app-containers_card_view/REQ-51
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-1
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-4
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-6
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-8
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-12
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-13
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-14
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-15
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-16
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-18
- plan-docker_management_app-containers_card_view-stats_gate_websocket/REQ-19
