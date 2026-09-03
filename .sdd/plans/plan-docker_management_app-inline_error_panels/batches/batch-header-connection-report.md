---
batch: 3 · header-connection-report
feature: F3 — The header is the only report of the connection
closed_req: REQ-9, REQ-10, REQ-11, REQ-12
depends: —
---

# Batch 3 — header-connection-report

Requirements: `.sdd/plans/plan-docker_management_app-inline_error_panels/requirements.md`. Ids cited,
never copied.

**Two states are reported today as one.** The connection status service sets `daemon.reachable` to
`false` in two different situations: the live channel is not delivering (the application server), and
the channel delivered a status saying the daemon cannot be reached. The header says
`Daemon unreachable` for both. This batch tells them apart and names each one.

**The retry control already exists** — the header pill's inline `Retry` — and it is kept as it is
(REQ-11). No control is added and no toast gains one.

**What recovery already works.** The screens fed by the live channel fill again on their own: the
server pushes every held value to a channel that opens. What does not is the readings taken by
request — the disk usage, the daemon information, the coverage baseline, the console history, the
compose file, the inspect readings. INT-4 covers those.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/shell/services/ConnectionStatusService.tsx` | Report which of the two is unreachable: the live channel not delivering is the application server, a delivered status with the daemon not reachable is the daemon. Nothing else about the service changes. | REQ-9 | — |
| INT-2 | modify | `client/src/shell/Shell.tsx` | The header report reads `Server unreachable` in the first case and `Docker daemon unreachable` in the second. Its tone, its position and its inline `Retry` are unchanged. | REQ-9, REQ-11 | INT-1 |
| INT-3 | modify | `client/src/shell/Shell.tsx`, header action row | The longer wording must not push the report out of the header. Measure it at the phone breakpoint and at each supported width, and record the figures. | REQ-10 | INT-2 |
| INT-4 | modify | `client/src/data/reload-signal.ts` and the one place that watches the channel | When the live channel starts delivering again, fire the application's existing reload signal once, so every mounted view reads its data again. Nothing about reconnection or polling changes. | REQ-12 | — |
| INT-5 | modify | `client/src/shell/Shell.tsx` and the screens read by request | Check that the screen the operator is on fills again after the connection returns, without navigating away. Report any screen that does not. | REQ-12 | INT-4 |
| INT-6 | modify | `.sdd/modules/app-shell/specs/connection-status-service.md`, `specs/shell.md`, `.sdd/modules/app-shell/index.md`, `.sdd/modules/live-channel/index.md` if a responsibility line moves | Record the two named states with their wording, the measured header at the phone breakpoint, and the reload fired when the channel returns. | REQ-9, REQ-10, REQ-12 | INT-3, INT-5 |

## Human acceptance

### Scenario: the header names what is unreachable

- REQ → REQ-9, REQ-11
- Given → the Docker daemon is stopped and the application server is running
- When → the operator looks at the top right of any screen
- Then → the report reads `Docker daemon unreachable`, with a `Retry` control beside it

### Scenario: the application server is the one that is gone

- REQ → REQ-9
- Given → the operator has the application open and the application server stops answering
- When → the operator looks at the top right
- Then → the report reads `Server unreachable`

### Scenario: the report is visible on a phone-width window

- REQ → REQ-10
- Given → the window is at the phone breakpoint and the daemon is unreachable
- When → the operator opens any screen
- Then → the header report is visible in full, on every screen

### Scenario: the screen fills again when the connection returns

- REQ → REQ-12
- Given → the operator is on the Volumes & networks screen and its data could not be loaded
- When → the Docker daemon starts again
- Then → the screen shows its volumes and networks, with the operator navigating nowhere
