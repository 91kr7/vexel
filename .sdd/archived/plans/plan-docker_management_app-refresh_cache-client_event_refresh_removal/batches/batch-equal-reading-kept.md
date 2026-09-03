---
batch: batch-equal-reading-kept
feature: A reading equal to the one in hand replaces nothing
closed_req: [REQ-47, REQ-48, REQ-49, REQ-50, REQ-51, REQ-52, REQ-53]
depends: [batch-volumes-networks-screen-scoped]
---

# Batch — A reading equal to the one in hand replaces nothing

The six polled list hooks store every reading they receive. The array is newly parsed each time, so
its identity always changes and the table below it is redrawn twenty times a minute even when the
answer is byte-for-byte the one already on screen. On the Images screen, with many rows, that is the
most visible of the three reductions in this extension.

The rule is not new: the third batch already wrote it for the container's inspect data and its
process listing. What is new is the shape. Those two compare with
`JSON.stringify(current) === JSON.stringify(result)` — two serialisations per tick, one of them
re-serialising a reading that was already serialised the tick before, on a payload of tens of
kilobytes every three seconds. The form to use, here and carried back there, is **one serialisation
per tick**: what arrived is serialised, compared against the serialisation kept beside the reading in
hand, and replaces it when the two differ.

Eight hooks holding one stateful rule is where eight copies diverge, so the rule gets one place to
live and the hooks call it.

## What this batch builds

- **The keeper of an equal reading** — one component in the client's data layer holding the whole
  rule: given the reading that has just arrived, it answers with the one to store, and keeps beside
  it the serialisation the next tick will compare against. Its callers are the six list hooks and the
  two container-detail hooks; nothing else in the client compares readings.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | client, the data layer of the client | The keeper: given what has just arrived it answers with the reading to store — the one in hand when the two serialise alike, otherwise the new one — serialising only what arrived and keeping that serialisation aside for the next tick. | REQ-47, REQ-49 | — |
| INT-2 | modify | `client/src/data/use-containers.ts`, `use-images.ts`, `use-volumes.ts`, `use-networks.ts`, `use-compose-projects.ts`, `use-plugins.ts` | Each stores its reading through the keeper instead of storing it outright. Nothing else about the six moves. | REQ-47, REQ-48, REQ-51 | INT-1 |
| INT-3 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-container-processes.ts` | Replace the two hand-written double serialisations with the keeper — three call sites, the inspect payload plus the processes and their titles. The behaviour both hooks contract stays exactly as it is. | REQ-49, REQ-50 | INT-1 |
| INT-4 | create | module `app-shell` — a spec for the keeper and its index row | What it answers and the one cost rule it exists for: a tick serialises the reading that arrived and nothing else, the previous serialisation being kept beside the reading it belongs to. | REQ-49 | INT-1 |
| INT-5 | modify | `.sdd/modules/containers/specs/use-containers.md`, `images/specs/use-images.md`, `volumes/specs/use-volumes.md`, `networks/specs/use-networks.md`, `compose/specs/use-compose-projects.md`, `plugins/specs/use-plugins.md` and their six index rows | Each contract gains the rule it now holds: a reading equal to the one in hand is kept, so nothing downstream is redrawn; a different one replaces it, within the same period as before. | REQ-47, REQ-48 | INT-2 |
| INT-6 | modify | `.sdd/modules/containers/specs/use-container-detail.md`, `.sdd/modules/containers/specs/use-container-processes.md` | Both already state the rule. State that the keeper holds it now, and that what they contract about a tick — REQ-29 and REQ-30 of the third batch — is unchanged. | REQ-50 | INT-3 |
| INT-7 | create | client check tree, unit | One file over the six, the claim being about the set: an identical answer arriving on a tick leaves what the hook holds untouched, a different one replaces it, and all six are in the table. | REQ-47, REQ-48, REQ-53 | INT-2 |
| INT-8 | create | client check tree, unit | The cost rule: a tick serialises the reading that arrived and nothing else — the one in hand is never serialised a second time. | REQ-49, REQ-53 | INT-1 |
| INT-9 | modify | `client/test/unit/use-container-detail.test.tsx`, `client/test/unit/use-container-processes.test.tsx` | Both already assert that a tick finding nothing changed changes nothing and that a tick finding something changed replaces it. Keep both against the new form; nothing dropped, nothing softened. | REQ-50, REQ-53 | INT-3 |
| INT-10 | modify | the checks that cover the six hooks, file by file: `client/test/unit/use-containers.test.tsx`, `use-images.test.ts`, `use-volumes.test.ts`, `use-networks.test.ts`, `use-plugins.test.ts`, `list-hooks-unchanged.test.tsx`, `active-context-broadcast-subscribers.test.tsx` | Census: each hook's first read, failure reporting, loaded flag, period, context switch, reload signal and post-action re-read still assert what they asserted. No ordering guard is introduced and `no-response-sequencing-guard` stays in the register. No file under `server/` is edited, no assertion softened, none dropped, no budget lengthened. | REQ-51, REQ-52, REQ-53 | INT-2, INT-3 |

> **`use-compose-projects` has no unit check of its own** — `list-hooks-unchanged.test.tsx` covers its
> shape and its period, nothing else. INT-7 being one file over the six is what gives it coverage
> here, rather than a check file created for one hook.

## Human acceptance

### Scenario: a list that has not changed stops being redrawn

- REQ → REQ-47, REQ-48
- Given → the operator has the Images screen open with many rows, and nothing is happening on the host
- When → they record what the browser does for a minute
- Then → the three-second ticks arrive and nothing is drawn at all; and the moment an image is pulled from a terminal the new row appears within the same three seconds as today

### Scenario: the container detail still keeps what the operator opened

- REQ → REQ-50
- Given → the Inspect tab of a container, with a section opened and a word typed into the find
- When → the container changes state from a terminal
- Then → the section is still open, the find is still filtering, and only the values that changed have changed — exactly as the third batch left it

### Scenario: nothing else about the six moved

- REQ → REQ-51
- Given → the Containers, Images, Volumes & networks, Compose and Plugins screens
- When → the operator switches context, presses the refresh control and performs an action on each screen
- Then → every one of them reports its failures, loads and re-reads exactly as it does today

### Scenario: the sequencing debt is still on the books

- REQ → REQ-52
- Given → the technical-debt register after this batch
- When → the human looks for `no-response-sequencing-guard`
- Then → it is still there with its evidence, and nothing in the client orders the answers it receives

### Scenario: both suites are green and neither was made more patient

- REQ → REQ-53
- Given → the branch of this batch
- When → the human runs a full pass of the server suite and of the e2e suite
- Then → both are green, no file under `server/` was changed, and no assertion was softened, dropped or given a longer budget
