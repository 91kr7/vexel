---
batch: 33 · event-feed-keys
feature: Daemon event feed — identity of an event (remediation)
closed_req: []
depends: [2]
---

# Batch 33 — Two events in the same second are two events

Remediation batch, opened 2026-08-09 after a full-suite run. It touches product code, but closes no
new REQ: REQ-12 (live daemon event stream) and REQ-17 (the dashboard's recent-events panel) are
already certified in batches 2 and 25's perimeter. This corrects how the feed identifies an event.

## Why

The event list keys its rows on `<epoch-seconds>-<object-id>`. The daemon emits events with
second-granularity timestamps in that field, so two events concerning the same object within the
same second produce **the same key**. That is routine: a container start/stop pair, a prune
touching one object twice, an image tagged and untagged in one operation.

React uses a key to decide which DOM node belongs to which item across renders. Two children with
one key means the reconciler cannot tell them apart: it reuses a node for the wrong event, so a
row can show one event's action against another's timestamp, and a re-render can drop one of the
pair. The symptom seen so far is only the console error — thousands of lines per e2e run, drowning
the output — but the defect is a correctness one, not a logging one, and the visible list is where
it lands.

Observed continuously during every e2e run, on the Images screen, the Volumes & networks screen and
the Builders screen alike, in the form
`Encountered two children with the same key, '1786229808-<digest>'`.

## What a fix must establish

- Two events for the same object in the same second are distinct rows, each with its own action and
  timestamp, and neither disappears on re-render.
- The daemon event stream carries `timeNano`; an arrival ordinal assigned client-side is the other
  candidate. Whichever is chosen, the identity must be stable across re-renders of the same event —
  a key regenerated on every render defeats the purpose as thoroughly as a colliding one.
- No `Encountered two children with the same key` in the console during a full e2e run.

## Interventions

| ID | Type | Where | What | Depends |
| --- | --- | --- | --- | --- |
| INT-1 | modify | the daemon-event feed built in batch 2 (see `.sdd/modules/` for the component that renders the event list) | Give each event an identity that distinguishes two events of the same object in the same second, and state the rule in the component spec before changing the code. | — |
| INT-2 | modify | the component spec in `.sdd/modules/` | Record what identifies an event, and the invariant that the identity is stable across re-renders. | INT-1 |

## Human acceptance

Trigger two events on one container within the same second from a terminal (`docker stop` on a
running container is usually enough) and see two distinct rows in the feed, each with its own
action; a full e2e run produces no duplicate-key error in the console.
