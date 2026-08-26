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
  - on mount, with the tab visible → opens `GET /api/containers/stats/subscription` and keeps it
    open.
  - on unmount → closes it.
  - on the tab being hidden or backgrounded → closes it; on the tab becoming visible again → opens a
    new one.
  - what the connection carries is ignored: nothing this hook exposes depends on it, and the figures
    themselves keep arriving with the container list.

## Rules and invariants

- **Nothing is signalled at unload**: no `beforeunload`, no `pagehide`, no `unload` and no beacon,
  here or anywhere else in the client. The correct outcome never depends on one of them firing — a
  page that is killed, force-quit, discarded or cut off simply stops answering the server's periodic
  write, and the server releases it on its own.
- The visibility handling is an **optimisation over a mechanism already correct without it**: it
  closes the gate sooner than the server's own discovery would, and never later.
- Exactly one connection is held per mounted caller, whatever the number of visibility changes: a
  hidden-then-visible cycle leaves one connection, not two, so the server's count cannot drift
  upward across a session.
- Two screens using the hook at once are two consumers, which is ordinary: one of them leaving does
  not stop the sampling the other is reading.

## Dependencies

- containers: Container stats subscription endpoint

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-42
- plan-docker_management_app-containers_card_view/REQ-43
- plan-docker_management_app-containers_card_view/REQ-45
- plan-docker_management_app-containers_card_view/REQ-48
- plan-docker_management_app-containers_card_view/REQ-49
- plan-docker_management_app-containers_card_view/REQ-51
