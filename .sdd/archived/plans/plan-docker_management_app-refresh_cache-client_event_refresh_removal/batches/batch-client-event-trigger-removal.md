---
batch: batch-client-event-trigger-removal
feature: The client's Docker-event refresh trigger is removed
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15]
depends: []
---

# Batch — The client's Docker-event refresh trigger is removed

The browser stops reading data because a Docker event arrived. Thirteen places in the client
subscribe to the daemon event stream today; twelve of them do it to re-read, and they go. The
thirteenth is the Dashboard's event feed, and it is untouched.

This batch **removes and adds nothing**. No view gets a new trigger to make up for the one taken
away — human decision of 2026-09-01.

It is one batch on purpose. A half-done demolition leaves some screens with two triggers and some
with one, which is the state the spec names as worse than either end of it. REQ-13 is also only true
once every subscriber is gone.

The perimeter was counted in the client, not assumed. The thirteen subscribers are listed in
INT-1, INT-2, INT-3 and INT-4, and the seven views that lose their only automatic trigger are exactly
the seven the spec names.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | the six polling hooks under `client/src/data/`: `use-containers.ts`, `use-images.ts`, `use-volumes.ts`, `use-networks.ts`, `use-compose-projects.ts`, `use-plugins.ts` | Delete the effect that subscribes to daemon events, and the import it needs. In `use-containers.ts` delete `ACTIONS_NOT_AFFECTING_LIST` with it: nothing else reads that set. The mount read, the active-context subscription, the reload signal and the poll stay untouched. | REQ-1, REQ-3, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10 | — |
| INT-2 | modify | the two overview hooks: `client/src/data/use-system-overview.ts`, `client/src/data/use-disk-usage.ts` | Delete the daemon-event subscription and its import. Nothing replaces it. What stays is the read on mount, the reload signal and the context switch where each already has one. | REQ-1, REQ-2, REQ-3, REQ-7, REQ-8, REQ-10 | — |
| INT-3 | modify | the five detail hooks under `client/src/data/`: `use-container-detail.ts`, `use-image-inspect.ts`, `use-image-layers.ts`, `use-network-inspect.ts`, `use-volume-inspect.ts` | Delete the daemon-event subscription, its import and the `daemonEventConcerns` calls inside it. Nothing replaces it. The read on identity change and the reload signal stay. | REQ-1, REQ-2, REQ-3, REQ-7, REQ-9, REQ-10 | — |
| INT-4 | modify | `client/src/data/event-stream.ts` | Remove `onDaemonObjectTypeChanged` and `daemonEventConcerns`: after INT-1 to INT-3 neither has a caller. Keep `subscribeToDaemonEvents` and the one shared `EventSource` exactly as they are. | REQ-3, REQ-4, REQ-5, REQ-13 | INT-1, INT-2, INT-3 |
| INT-5 | create | client test tree, unit pass | A check that the client has exactly one caller of the daemon-event subscription, and that it is the event-feed service. It fails when any other client module imports it. | REQ-13 | INT-4 |
| INT-6 | modify | the ten hook unit tests under `client/test/unit/`: `use-images`, `use-volumes`, `use-networks`, `use-plugins`, `use-image-layer-stack`, `use-system-overview`, `use-disk-usage`, `use-image-inspect`, `use-network-inspect`, `use-volume-inspect` | Drop the event mock and every assertion on the event trigger. Keep every other assertion each file makes: the mount read, the poll interval, the reload signal and the context switch. | REQ-14, REQ-15 | INT-1, INT-2, INT-3 |
| INT-7 | modify | `client/test/unit/list-hooks-unchanged.test.tsx` | Its subject includes the event subscription the list hooks are said to keep. Rewrite that part to assert the triggers that remain. Assert nothing about events, and soften nothing else in the file. | REQ-6, REQ-14, REQ-15 | INT-1 |
| INT-8 | modify | `client/test/unit/daemon-event-attribution.test.ts`, `client/test/unit/active-context-broadcast-subscribers.test.tsx`, `client/test/unit/stats-subscription-consumers.test.tsx` | Remove the first file: it covers `daemonEventConcerns`, which INT-4 removes. In the other two, drop the event-stream mock once the modules under test no longer import it. | REQ-3, REQ-14 | INT-4 |
| INT-9 | modify | `client/e2e/detail-reread-scoped.spec.ts` | Both its tests cover the client's event-driven detail re-read, so the file goes with the behaviour. Before removing it, confirm that `server/test/api/detail-derivation-follows-listing.test.ts` and its unit counterpart still close the server requirements its second test also touched. | REQ-14, REQ-15 | INT-3 |
| INT-10 | modify | every check of the repository: `client/test/unit/`, `client/e2e/` and `client/e2e/exclusive/`, file by file | Census over the whole tree, no folder skipped. A check that waited for a view to follow a daemon event drives a remaining trigger instead, or goes with the behaviour. No file under `server/test/` is edited, and the server passes stay green as they are. | REQ-5, REQ-11, REQ-12, REQ-14, REQ-15 | INT-6, INT-7, INT-8, INT-9 |
| INT-11 | modify | the component specs and index rows of the thirteen hooks named above, plus `.sdd/modules/events/` | Take the event trigger out of every contract that still states it, `event-stream-client.md` included, and out of the index rows that describe it. State in each what triggers the read now. | REQ-1, REQ-2, REQ-3 | INT-4 |

> **INT-10 is a census and not a sweep, and it covers `exclusive/` because a census that stopped at
> that folder has already cost this repository a red run** — `plan-docker_management_app-refresh_cache/REQ-66`.

## Human acceptance

### Scenario: an open detail stops following the daemon on its own

- REQ → REQ-1, REQ-2, REQ-10
- Given → the operator has a container's detail open, on the Inspect tab
- When → someone stops that container from a terminal
- Then → the detail keeps showing what it last read, and nothing on screen says why

### Scenario: the event feed shows the daemon's activity exactly as before

- REQ → REQ-4, REQ-5
- Given → the operator is on the Dashboard, with the "Daemon event stream" panel visible
- When → a network is created from a terminal
- Then → the network's name appears in that panel within a few seconds, as it does today

### Scenario: the lists still follow their clock

- REQ → REQ-6
- Given → the operator is on the Containers screen, with a running container listed
- When → that container is stopped from a terminal
- Then → the card shows the new state after about three seconds, without the operator doing anything

### Scenario: the refresh control brings a quiet view up to date

- REQ → REQ-2, REQ-7
- Given → a volume's detail is open and names a container under "Mounted by" that has since been removed from a terminal
- When → the operator presses the refresh control in the top bar
- Then → the detail no longer names that container

### Scenario: a context switch re-reads what it re-read before

- REQ → REQ-8
- Given → the operator has two Docker contexts and is on the Containers screen
- When → the operator selects the other context
- Then → the screen shows the new daemon's containers, exactly as it does today

### Scenario: an action taken in the application still shows its result at once

- REQ → REQ-9
- Given → the operator is on the Containers screen, with a running container listed
- When → the operator stops it from the card's own menu
- Then → the card shows it stopped straight away, without pressing refresh and without waiting for the clock

### Scenario: the only thing left listening for daemon events is the feed

- REQ → REQ-3, REQ-13
- Given → the branch of this batch
- When → the human searches the client for callers of the daemon-event subscription
- Then → there is one, the Dashboard's event-feed service, and no by-object-type invalidation facility is left in the client

### Scenario: the live streams are untouched

- REQ → REQ-11
- Given → a running container with its detail open on the Logs view
- When → the container writes new lines
- Then → the lines keep arriving live, and the statistics keep moving

### Scenario: both suites are green and neither was made more patient

- REQ → REQ-12, REQ-14, REQ-15
- Given → the branch of this batch
- When → the human runs a full pass of the server suite and of the e2e suite
- Then → both are green, no file under `server/` was changed, and no assertion was softened, dropped or given a longer budget
