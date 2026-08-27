---
batch: inspect-full-payload
feature: F1 … F8 — the whole plan, in one batch by the human's instruction
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35]
depends: []
---

# Batch — The Inspect tab becomes the whole payload, and moves after Config

**One batch by the human's instruction of 2026-08-27** ("tutto in un unico batch"), against the
workflow's own rule of one batch per feature. Recorded as a departure in `batches.md`; the
interventions below are still cut per point of the system, and their `Depends` column is the build
order inside the batch.

**Where the payload already is.** The client is handed the daemon's response untouched:
`containers/specs/containers-service.md` contracts the inspect result's `raw` field as *"the full
inspect payload exactly as received, unmodified"*, and the delivered tab already prints it as JSON in
its last section. So the completeness this batch is about needs **nothing new from the server and
nothing new from the daemon** (REQ-25) — it is a rendering of data the tab is already holding and
throwing away.

**What is deliberately given up.** The delivered Inspect tab (`Identity` / `Lifecycle`, the
`Networks` / `Labels` / `Health` sections, the ten curated properties) goes entirely, superseding
`…-tabs_composition_refactor/REQ-34`. Two of its readings survive as *values* rather than as
composition — the state pill and the danger-toned non-zero exit code — and they survive through the
per-key reading of INT-5, applied to `State.Status` and `State.ExitCode` wherever the payload puts
them.

**What must not be lost.** `plan-ui-coherence-optimisation/REQ-65` names the raw payload as **real
selectable text** among the three things this panel may not lose, and
`plan-docker_management_app-remove_copy_controls/REQ-19` records hand-selection inside that block as
the accepted way to obtain the full container id. The block stays exactly that, pinned last (INT-8),
and no copy affordance appears anywhere in the rebuilt tab (REQ-24).

**And one rule deliberately not applied here.** `plan-ui-coherence-optimisation/REQ-60` — a group
holding a collection is drawn only when it holds something — governs the tab's delivered sections and
is refused on the rebuilt one (REQ-6): a field the daemon sent is on screen whether or not it holds
anything, because "this list is empty" is the answer the operator opened the tab for. The rule stands
everywhere else, this panel's Config tab included.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | ui-library, the data area of `client/src/ui/` | The shape reading of an arbitrary JSON value, as a domain-agnostic module: scalar / object / array; empty (`null`, `""`, `[]`, `{}`) told apart from `0`, `false` and `"0"`; a node's own count of fields or items; the split of a payload's top-level keys into composite sections and one gathered scalars group, in the payload's own key order; and a flattening of the whole tree into addressable entries (key path, key name, literal value) that a filter can read. Knows no Docker vocabulary and fetches nothing. | REQ-4, REQ-6, REQ-7, REQ-8, REQ-10, REQ-14, REQ-21 | — |
| INT-2 | create | ui-library, the data area of `client/src/ui/` | The rendering of that shape: a section per composite top-level key and one leading section for the gathered scalars, each collapsible and stating its own count while closed; nested objects as labelled groups and arrays as counted lists of positional items, to any depth, never as stringified JSON; a leaf as a label→value band carrying the key name as its label, the literal value, and an optional caller-supplied reading beside it; an empty value drawn in place and marked as empty. No copy affordance, no truncation of a value, no Docker knowledge, and at a narrow width label and value stack instead of clipping. | REQ-3, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13, REQ-14, REQ-15, REQ-17, REQ-23, REQ-24, REQ-27, REQ-29, REQ-35 | INT-1, INT-3 |
| INT-3 | modify | `client/src/ui/glass/CollapsibleSection.tsx` | Its open state becomes drivable from outside — a controlled `open` beside the delivered `defaultOpen` — so a filter can open the sections holding matches and clearing the filter can put the tab back to its entry state. Every delivered caller keeps the uncontrolled behaviour it has today. | REQ-9, REQ-11, REQ-19 | — |
| INT-4 | create | ui-library, the data area of `client/src/ui/` | The find over that rendering: one search control above the sections, filtering on key name and on literal value across the entire flattened tree; while it holds text only matching fields are drawn, every section holding a match is opened however deep the match sits, and the number of matches is stated; a search matching nothing says so rather than leaving a blank surface; clearing it restores the whole payload and the entry section state. | REQ-19, REQ-20, REQ-21, REQ-23 | INT-1, INT-2, INT-3 |
| INT-5 | create | containers module, feature code under `client/src/containers/` | The per-key reading of the container inspect payload, as a shared rule beside `container-status.ts`: which key paths are timestamps, byte counts, nanosecond durations, booleans, the state, the health outcome, an exit code, a port binding — and the documented, unambiguous sentinels (`0` as "no limit" on a resource field). Returns a reading to be shown **beside** the literal, never in place of it, and returns nothing for a key it does not recognise. The state pill and the danger tone of a non-zero exit code come from `container-status.ts`'s existing reading, not from a second one. | REQ-15, REQ-16, REQ-17, REQ-18, REQ-27 | — |
| INT-6 | modify | `client/src/containers/ContainerDetailPanel.tsx`, `renderInspectView` | The Inspect tab body is replaced outright: the payload-derived rendering of INT-2 and the find of INT-4 over the inspect result's `raw` payload, with INT-5 as its per-key reading. The `Identity` / `Lifecycle` groups, the `Networks`, `Labels` and `Health` sections and the ten curated properties are gone, with no summary block put in their place — the modal's header goes on carrying name, short id, state and health. On entry exactly two sections are open, the leading scalars group and `State`. Nothing is fetched that was not fetched before. | REQ-3, REQ-4, REQ-5, REQ-11, REQ-16, REQ-22, REQ-25 | INT-2, INT-4, INT-5 |
| INT-7 | modify | `client/src/containers/ContainerDetailPanel.tsx`, the `DETAIL_TABS` constant | Inspect moves to second place, immediately after Config; Logs, Stats, Processes, Exec and Attach follow in their present relative order. Config stays the tab drawn first and the tab selected on open, the running-only filter on Exec and Attach is unchanged, and nothing else about the bar changes. | REQ-1, REQ-2 | — |
| INT-8 | modify | `client/src/containers/ContainerDetailPanel.tsx`, the Inspect tab's `Raw payload` section | The raw payload becomes the **last** section of the rebuilt tab, after every payload-derived one, still collapsed on entry, still the whole payload as real selectable text in the library's code viewer, and still with no action of its own. | REQ-12, REQ-24 | INT-6 |
| INT-9 | modify | `client/e2e/container-inspect-groups.spec.ts` | Deleted outright and written from scratch in its place, against the rebuilt tab: the payload-derived sections and their counts, an empty value marked empty while `0` and `false` read as themselves, a nested object as a group and an array as counted items, a formatted reading beside its literal, the state pill and the toned non-zero exit code, the ten former properties each found in its own section, and the absence of any copy control. The rewritten spec must fail on the delivered build. Real pointer at the visible control's coordinates, own labelled fixtures, cleanup in a `finally` with `docker rm -fv`, passing when run on its own. | REQ-5, REQ-30, REQ-32, REQ-33, REQ-35 | INT-6, INT-7, INT-8 |
| INT-10 | modify | `client/test/unit/container-detail-panel.test.tsx`, `client/e2e/containers.spec.ts`, `client/e2e/container-detail-property-columns.spec.ts`, `client/e2e/container-detail-density.spec.ts`, `client/e2e/copy-affordance-absence.spec.ts`, `client/e2e/copy-affordance-geometry.spec.ts` | Every check outside this tab that the reorder or the rebuild invalidates is rewritten rather than deleted or weakened: those reaching a tab by its position in the bar, those reading the Inspect tab's former groups, and those asserting the absence of a copy affordance and the property band's geometry on this tab — re-established against the new composition. The other six tabs, the modal's frame, header, stable height and dismissal behaviour are re-asserted unchanged. | REQ-2, REQ-24, REQ-26, REQ-31 | INT-6, INT-7, INT-8 |
| INT-11 | create | `client/test/unit/` and `client/e2e/` | The completeness check, written against the payload and never against a list of key names: it reads the inspect response the tab was given and asserts that every key in it is accounted for on screen, and that no field appears that the response does not carry. A key the developer has never seen therefore fails it by absence instead of passing by omission. Run against a real container of the test's own making. | REQ-3, REQ-4, REQ-33, REQ-34 | INT-6 |
| INT-12 | create | `client/e2e/`, with `client/scripts/check-ui-conformance.mjs` left unedited | The closing pass: the dialog's viewport box asserted identical before and after selecting Inspect, opening a section and typing in the find, with the control just operated still inside the viewport; the tab's content scrolling inside the dialog and no scrollbar on the page behind it; opening the tab and typing in the find measured on a real payload — a container on several networks with many bindings — inside a dialog also holding a live stream; 375×812 with label and value stacked, nesting legible and nothing scrolling sideways; and the UI-boundary and blur passes green with the allow-list and the check script unedited. | REQ-22, REQ-23, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-32, REQ-33 | INT-9, INT-10, INT-11 |

## Human acceptance

### Scenario: every field `docker inspect` returns is on screen, section by section

- REQ → REQ-3, REQ-8, REQ-9, REQ-10, REQ-13
- Given → a container's detail open, and the same container's `docker inspect` output in a terminal
- When → the operator selects Inspect and opens the sections one by one
- Then → the tab is divided into sections named after the payload's own top-level keys, in the
  payload's order, each stating how much it holds before it is opened, and every field of the
  terminal's output is found under one of them — nested objects as groups and arrays as numbered
  items, none of them as a line of JSON

### Scenario: a field with nothing in it says so, and a zero says zero

- REQ → REQ-6, REQ-7
- Given → a container whose payload carries empty values (an empty label map, an empty DNS list, a
  null network id) and an exit code of `0`
- When → the operator opens the sections holding them
- Then → each empty field is there in its own place, marked as empty rather than missing, and the
  exit code reads as `0` and the privileged flag as false, neither of them marked empty

### Scenario: the operator finds a field without opening a single section

- REQ → REQ-19, REQ-20, REQ-21
- Given → a container's detail open on Inspect, with everything but the first two sections closed
- When → the operator types `RestartPolicy` — and then a value they expect, such as a host port — in
  the tab's find control
- Then → only the matching fields are on screen, the sections holding them have opened themselves
  however deep the match sits, the number of matches is stated, and clearing the control puts the tab
  back the way it opened

### Scenario: a value is readable and still exactly what the daemon said

- REQ → REQ-15, REQ-16, REQ-17, REQ-18, REQ-35
- Given → a container that has been started and has exited non-zero
- When → the operator reads its creation and start times, its memory limit, its state and its exit
  code
- Then → each field carries the daemon's own key name, the readable date, the byte unit and the
  yes/no are shown beside the literal the daemon sent rather than instead of it, the state reads as a
  pill, the non-zero exit code reads as bad news, and an environment variable holding a token is
  shown in full like any other value

### Scenario: Inspect is the second tab and the raw payload is the last section

- REQ → REQ-1, REQ-2, REQ-5, REQ-12
- Given → a running container's detail just opened
- When → the operator looks at the tab bar, then selects Inspect and scrolls to the foot of the tab
- Then → Config is drawn first and is the active tab, Inspect is immediately after it and the other
  five follow, the ten properties the old tab listed are each found inside the section of their own
  key with no summary block at the head, and the raw payload is the last section, closed, holding the
  whole payload as text that can be selected by hand

### Scenario: the dialog does not move, and the tab works on a phone

- REQ → REQ-22, REQ-23, REQ-24, REQ-29
- Given → a container's detail open, on a viewport of 375×812 and again on a full-size one
- When → the operator selects Inspect, opens a section and types in the find
- Then → the dialog's frame does not move at all, the content scrolls inside it, the tab stays
  responsive on a payload of hundreds of fields, labels and values stack legibly at the phone width
  with nothing to scroll sideways, and no copy control appears anywhere

### Scenario: nothing else about the detail changed

- REQ → REQ-25, REQ-26
- Given → a container whose detail is open
- When → the operator streams its logs, watches its statistics, edits its configuration, opens a
  session and then closes the dialog
- Then → the same data, the same operations and the same confirmations as before, the point of
  interaction returns to the control that opened the detail, nothing is left streaming, and the
  daemon is asked for nothing it was not asked for before
