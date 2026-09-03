---
batch: batch-container-detail-clock
feature: The container detail follows the container it shows
closed_req: [REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-39]
depends: [batch-dashboard-overview-clock]
---

# Batch — The container detail follows the container it shows

The human paused a container from outside while its detail was open on the Inspect tab. The dialog's
header read PAUSED; the payload three centimetres below it read `Status: running`, `Paused: false`.
One screen, one moment, two contradictory statements — and `State` is one of the sections the payload
opens on, so it was the first thing in view.

The header is right and the payload was stale: the header is built from the container summary the
screen polls every 3 000 ms, while the payload lost its only trigger in the first batch. This batch
gives the payload **the same clock as the header**, not a clock of its own — a second number here
would rebuild the same defect one layer down — and gives one to the process listing beside it.

Two things bound the work. Each clock runs **only while the tab that shows its data is on screen**,
so the daemon pays nothing for a tab nobody is looking at; and a tick that finds nothing changed
**changes nothing on screen**, because the Inspect tab is several hundred fields with sections the
operator opens, a find that filters them and a raw payload they select text out of.

The server is not touched (REQ-38): these two readings stay pull-based, which is the human's standing
decision, recorded in the tech-debt entry `detail-views-reread-on-unrelated-events`.

## What this batch builds

Nothing new. Two existing hooks gain a clock, and the panel above them gains the one thing it has to
say for the clocks to be scoped: which tab is showing.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/src/data/use-container-detail.ts` | Add the clock: one interval at `cadence(3000)` re-reading the inspect data, running only while the caller says its data is on screen, reading once the moment that becomes true, cleared on unmount. Every trigger the hook has today stays. | REQ-25, REQ-26, REQ-28, REQ-33, REQ-34 | — |
| INT-2 | modify | `client/src/data/use-container-processes.ts` | The same clock, at the same declared cadence, running only while the caller says the listing is on screen **and** the container is running. The tab's own refresh, the read on `id` change and the reload signal stay. | REQ-27, REQ-28, REQ-33, REQ-34 | — |
| INT-3 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-container-processes.ts` | A read that comes back the same as what is already held does not replace it, so nothing downstream is redrawn. Only a read that differs replaces. | REQ-29 | INT-1, INT-2 |
| INT-4 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-container-processes.ts` | A read that fails leaves what is held on screen and does not change how the failure is reported. A container that no longer exists is still reported the way it is today. | REQ-32 | INT-1, INT-2 |
| INT-5 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Tell each hook whether the tab showing its data is the active one — Inspect or Config for the inspect data, Processes for the listing — and hand the processes hook the container's running state. Nothing is added to the screen, no tab content is remounted by a re-read, and the edit form is still built only when the operator starts an edit. | REQ-26, REQ-27, REQ-28, REQ-30, REQ-31, REQ-35, REQ-36 | INT-1, INT-2 |
| INT-6 | modify | `.sdd/modules/containers/specs/use-container-detail.md`, `.sdd/modules/containers/specs/use-container-processes.md`, and their two `containers` index rows | Both contracts say the data is read on `id` change and on demand, one of them that it is never polled. State the clock, what it is scoped to, the read when the tab opens, and the two rules on a tick that finds nothing changed and a tick that fails. | REQ-26, REQ-27, REQ-28, REQ-29, REQ-32, REQ-34 | INT-1, INT-2, INT-3, INT-4 |
| INT-7 | modify | `.sdd/modules/containers/specs/container-detail-panel.md`, `.sdd/modules/containers/specs/container-processes-view.md`, and their `containers` index rows | State what the panel now tells each hook, and what a tick does and does not do to the two tabs: values replaced where they stand, sections and find kept, an edit in progress untouched, Logs, Stats, Exec and Attach unchanged. | REQ-30, REQ-31, REQ-35, REQ-36 | INT-5 |
| INT-8 | modify | `client/test/unit/use-container-detail.test.tsx` | Its seven event tests cover a trigger the first batch removed. Rewrite the file against the triggers that exist after this batch: the clock at the declared cadence, only while the data is shown, a read when it becomes shown, no tick after unmount, and the equality and failure rules. The `id`-change, refresh and reload assertions stay. | REQ-26, REQ-28, REQ-29, REQ-32, REQ-33, REQ-39 | INT-1, INT-3, INT-4 |
| INT-9 | modify | `client/test/unit/use-container-processes.test.tsx` | The same, plus the one rule of its own: while the container is not running, no read is made at all. Every assertion the file already makes stays. | REQ-27, REQ-28, REQ-29, REQ-33, REQ-39 | INT-2, INT-3, INT-4 |
| INT-10 | modify | the check created by `batch-dashboard-overview-clock`/INT-13, in the client unit tree | It asserts that the five detail hooks and the disk-usage hook hold no interval, and two of them now do. Narrow it to the five that still hold none — the disk-usage view and the image, image-layer, network and volume details — naming the two that no longer do. | REQ-37, REQ-39 | INT-1, INT-2 |
| INT-11 | modify | `client/test/unit/container-detail-panel.test.tsx`, `client/test/unit/container-processes-view.test.tsx` | The panel hands each hook whether its tab is showing, and the two tabs gained nothing the operator can see. Nothing already asserted is dropped. | REQ-28, REQ-35, REQ-39 | INT-5 |
| INT-12 | create | client check tree, e2e | The defect itself: with a container's detail open on the Inspect tab and nobody touching it, the container is paused from the daemon and the header and the payload agree within one period. | REQ-25, REQ-39 | INT-5 |
| INT-13 | create | client check tree, e2e | What a tick must not disturb: a section the operator opened is still open after one, a find still filters, and an edit in progress on the Config tab keeps every value typed into it. | REQ-29, REQ-30, REQ-31, REQ-39 | INT-5 |
| INT-14 | create | client check tree, e2e | The Processes tab follows what runs inside the container without being asked, and a container that is not running is asked for nothing at all. | REQ-27, REQ-39 | INT-5 |
| INT-15 | modify | the checks that cover the container detail, file by file: `client/e2e/container-detail-*.spec.ts`, `client/e2e/container-inspect-*.spec.ts`, `client/e2e/container-stats-processes.spec.ts`, and the client unit tree | Census: a check that expected the detail to keep showing what it last read now expects it to follow. No file under `server/` is edited, no assertion softened, none dropped, no budget lengthened. | REQ-34, REQ-36, REQ-38, REQ-39 | INT-8, INT-9, INT-11 |

> **INT-8 lands on a file the first batch's census has not reached** — its seven event tests are still
> there, that batch's tester pass never having been run. INT-8 replaces them with the triggers that
> exist after this batch; nothing about daemon events is restored.

## Human acceptance

### Scenario: the dialog stops contradicting itself

- REQ → REQ-25, REQ-26, REQ-35
- Given → the operator has a container's detail open on the Inspect tab, with `State` in view
- When → someone pauses that container from a terminal
- Then → a few seconds later the header and the payload both say it is paused, with the operator doing nothing and nothing on screen saying why

### Scenario: switching to a tab shows what is true now

- REQ → REQ-28, REQ-34
- Given → the operator has been watching the Logs tab of a container that has since been paused
- When → they switch to the Inspect tab
- Then → the payload already says the container is paused, without a wait and without a refresh

### Scenario: the processes list follows what runs inside the container

- REQ → REQ-27
- Given → the operator has the Processes tab open on a running container
- When → a new process starts inside that container
- Then → it appears in the table on its own, and the tab's refresh control still works as it did

### Scenario: what the operator opened stays open

- REQ → REQ-29, REQ-30
- Given → the operator has opened `NetworkSettings` in the Inspect payload and typed a word into the find
- When → the container changes state from a terminal and the payload follows it
- Then → the section is still open, the find is still filtering, and only the values that changed have changed

### Scenario: an edit in progress is left alone

- REQ → REQ-31
- Given → the operator is editing the Config tab, with values typed and not yet saved
- When → the container changes from outside while they are typing
- Then → every value they typed is still there, and the form is not rebuilt under them

### Scenario: a container that disappears is still reported the way it was

- REQ → REQ-32
- Given → the operator has a container's detail open
- When → that container is removed from a terminal
- Then → the detail keeps showing what it last read and says the container no longer exists, exactly as it does today — not a failed read

### Scenario: the other detail views did not get a clock

- REQ → REQ-36, REQ-37
- Given → the operator has a volume's detail open, and a container's logs streaming in another moment
- When → the volume is changed from a terminal
- Then → the volume detail still shows what it last read, while the logs and the statistics keep arriving live as they always have

### Scenario: both suites are green and neither was made more patient

- REQ → REQ-33, REQ-38, REQ-39
- Given → the branch of this batch
- When → the human runs a full pass of the server suite and of the e2e suite
- Then → both are green, no file under `server/` was changed, and no assertion was softened, dropped or given a longer budget
