---
batch: batch-dashboard-overview-clock
feature: The Dashboard's overview figures move on a clock
closed_req: [REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24]
depends: [batch-client-event-trigger-removal]
---

# Batch — The Dashboard's overview figures move on a clock

The first batch left the Dashboard's tiles with no automatic trigger, above a container panel that
keeps moving on its own poll. This batch gives them a clock of **3 000 ms** — the same one that panel
runs on — and makes the reading behind them cheap enough to repeat.

Cheap enough is the whole of the server half. Today `GET /api/system/overview` reads from the daemon
on every request: one `/system/df` and three CLI spawns, of which three bypass a value the server
already holds. On a clock that would be paid once per tick and once per open window, for the call
this cycle's spec names as the most expensive the application makes. After this batch the overview is
assembled from what the server holds, and a tick costs an in-memory read.

The scope of REQ-12 — the first batch's "the server is unchanged" — and the figures behind the period
are in `../batches.md`. REQ-23 bounds what the server work may touch: no endpoint added or removed,
the same payload, no other screen's data changed.

## What this batch builds

- **The held disk-usage reading** — the `/system/df` reading, registered as a kind of the refresh
  cache and kept on the 300 000 ms rhythm the volume sizes already run on. It **replaces** the
  volume-size kind rather than joining it, so the server still makes that call once per period and
  not twice. The volume sizes become one view of it, unchanged. The reclaimable-space breakdown of
  System & prune is not built from it and stays the direct read it is today.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/system/disk-usage-service.ts` | Register the `/system/df` reading as a held kind of the refresh cache, period 300 000 ms, and expose what it holds. It takes over from the volume-size kind: one reading of that call on the server, not two. | REQ-22 | — |
| INT-2 | modify | `server/src/volumes/volumes-service.ts` | The volume sizes become a view of the held reading: the kind of their own goes, the sizes come from INT-1. The listing behaves exactly as today — an unknown size absent rather than awaited, the first sizes marking the listing changed — and the same events and operations mark the reading due. | REQ-22, REQ-23 | INT-1 |
| INT-3 | modify | `server/src/system/prune-service.ts` | It marks the volume sizes due once a run has succeeded; it marks the held reading due instead. Same moment, same effect on the operator. | REQ-22, REQ-23 | INT-1 |
| INT-4 | modify | `server/src/system/overview-service.ts` | Assemble the payload from what the server holds: the disk figures from INT-1, the image and volume counts from the held listings, the stacks, the build cache and the active builder from their held inventories. The container counts already come from the held listing and do not move. | REQ-22, REQ-23 | INT-1 |
| INT-5 | modify | `server/src/system/overview-service.ts` | The first read only: with nothing held yet the overview waits for the disk-usage reading, so the first paint is what it is today. Afterwards it answers from what is held and asks for a read it does not wait for — no tick ever waits for `/system/df`. | REQ-22 | INT-4 |
| INT-6 | modify | `client/src/data/use-system-overview.ts` | Add the clock: one interval at `cadence(3000)` re-reading the overview, started on mount and cleared on unmount, in the form the list hooks already use. The read on mount, the reload signal and the context switch stay as they are, and the screen gains nothing. | REQ-16, REQ-17, REQ-18, REQ-19, REQ-20 | — |
| INT-7 | modify | `.sdd/modules/system/specs/disk-usage-service.md`, `.sdd/modules/system/specs/overview-service.md`, `.sdd/modules/system/specs/prune-service.md`, `.sdd/modules/volumes/specs/volumes-service.md`, `.sdd/modules/volumes/specs/volumes-endpoints.md`, and the `system` and `volumes` index rows | State the held reading with its period and what marks it due, the overview assembled from held values, and — in the overview's contract — that a count and a size shown together may describe different moments. | REQ-22, REQ-23 | INT-1, INT-2, INT-3, INT-4, INT-5 |
| INT-8 | modify | `.sdd/modules/dashboard/specs/use-system-overview.md` and the `dashboard` index row | The contract states that the hook does not poll, and gives the reason INT-1 to INT-5 remove. State the clock, its period, that it runs only while the hook is mounted, and that the other three triggers are unchanged. | REQ-16, REQ-17, REQ-18, REQ-19 | INT-6 |
| INT-9 | modify | `client/test/unit/use-system-overview.test.ts` | Add the clock: a read on each tick of the declared period, and no tick after unmount. Every assertion the file already makes stays. | REQ-17, REQ-18, REQ-24 | INT-6 |
| INT-10 | modify | `server/test/unit/overview-service.test.ts`, `server/test/unit/disk-usage-totals.test.ts` | Drive REQ-22 where it can be counted: a series of overview reads inside one period asks the daemon and the CLI for nothing already held — the first read pays, the rest pay nothing. | REQ-22, REQ-24 | INT-4, INT-5 |
| INT-11 | modify | `server/test/unit/volumes-service.test.ts`, `server/test/unit/prune-service.test.ts`, `server/test/api/volume-sizes-routes.test.ts` | The volume sizes keep every behaviour these files assert, under the reading that replaced their kind. A check that named the old kind names the new one; nothing is softened. | REQ-23, REQ-24 | INT-2, INT-3 |
| INT-12 | create | client check tree, e2e | A check that drives the clock: with the Dashboard open and nobody touching it, a container created on the daemon changes the tile within the period; and the overview is re-read at the declared cadence, not faster and not slower. | REQ-16, REQ-18, REQ-24 | INT-6 |
| INT-13 | create | client check tree, unit | A check that the overview hook is the only one that gained a clock: the disk-usage hook and the five detail hooks of REQ-2 still hold no interval. | REQ-21, REQ-24 | INT-6 |
| INT-14 | modify | the checks that read the overview, file by file: `client/e2e/dashboard.spec.ts`, `client/test/unit/dashboard-screen.test.tsx`, `server/test/api/system-overview-routes.test.ts`, `server/test/api/derived-lists-follow-listing.test.ts`, `server/test/unit/shared-container-listing.test.ts` | Census: a check that expected the overview to be read fresh on every request now expects what the server holds. No assertion softened, none dropped, no budget lengthened. | REQ-20, REQ-23, REQ-24 | INT-4, INT-5 |

> **INT-12 asserts a change, never a total.** The tile is a count of the whole host, so the check
> reads it, creates its own container, and expects that figure to have moved by one — it never
> expects a number, and never an empty daemon.

## Human acceptance

### Scenario: the Dashboard follows the host with nobody touching it

- REQ → REQ-16, REQ-17, REQ-20
- Given → the operator is on the Dashboard, reading the summary tiles
- When → a container is started from a terminal
- Then → the running-containers tile counts it a few seconds later, without the operator doing anything, and nothing on the screen says the figures are on a clock

### Scenario: the counts move at once, the sizes take their time

- REQ → REQ-19, REQ-22
- Given → the operator is on the Dashboard and pulls an image from a terminal
- When → they watch the images tile
- Then → the number of images rises within seconds, while the space it reports on disk follows later — and at once if they press the refresh control in the top bar

### Scenario: a context switch still re-reads immediately

- REQ → REQ-19
- Given → the operator has two Docker contexts and is on the Dashboard
- When → they select the other context
- Then → the tiles show the other daemon's figures at once, as they do today

### Scenario: the quiet views did not get a clock too

- REQ → REQ-21
- Given → the operator has a container's detail open, on the Inspect tab
- When → someone stops that container from a terminal
- Then → the detail keeps showing what it last read, exactly as the first batch left it

### Scenario: both suites are green and neither was made more patient

- REQ → REQ-23, REQ-24
- Given → the branch of this batch
- When → the human runs a full pass of the server suite and of the e2e suite
- Then → both are green, every other screen shows what it showed, and no assertion was softened, dropped or given a longer budget
