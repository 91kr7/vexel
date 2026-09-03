---
batch: config-reading-layout
feature: F3 — Config in reading
closed_req: [REQ-18, REQ-19, REQ-20, REQ-21, REQ-22]
depends: [stable-detail-height]
---

# Batch — Environment variables become pairs, mounts become a section, and the action goes to the head

The right-hand column stacks the daemon's raw `KEY=value` strings and the mounts with the literal
prefix `mount: /src → /dst (ro)`. That word is doing a section label's work, repeated on every row;
and key and value are not aligned with each other, so reading the third variable means re-reading the
first two. `Edit configuration` acts on the whole tab but sits at the foot of one of its two columns,
as if it belonged to that one.

**The library already carries both shapes**, so this batch adds nothing to it: `DefinitionList` is
label→value bands arranged in as many columns as their own width carries, and `Chip` has the accent
tone that tells the salient chip from its neighbours. If the `ro` / `rw` distinction turns out to
need a tone `Chip` does not have, that tone is added to `Chip` first (REQ-38) and never written at
the call site.

**What must not be lost here** — the two-column property grid is one of the three things
`plan-ui-coherence-optimisation/REQ-65` names as the panel's, the `pair` arrangement stacking each
side at full width when the panel cannot carry both, and the rule that two property sections of the
same measured width show the same number of columns
(`plan-docker_management_app-detail_property_columns`, bug-4). The regrouping happens inside those,
not instead of them.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | Environment variables become key→value pairs on two aligned tracks under a heading carrying their count, instead of the daemon's raw `KEY=value` runs. | REQ-18, REQ-19 | — |
| INT-2 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | Mounts become a section of their own with its own heading and count; each entry reads source → destination with a `ro` / `rw` chip, the read-only one told from the read-write one, and the literal `mount:` prefix is gone. | REQ-20, REQ-21 | — |
| INT-3 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | `Edit configuration` moves to the head of the tab, above both columns and belonging to neither, keeping its label and what it does. | REQ-22 | — |
| INT-4 | modify | `client/e2e/containers.spec.ts`, `client/e2e/container-detail-property-columns.spec.ts`, `client/test/unit/container-detail-panel.test.tsx` | The checks that read an environment entry as `KEY=value` or a mount as a `mount:`-prefixed string are rewritten against the pairs and the chips rather than deleted; the certified column-count rule is re-asserted on the regrouped sections, and the `Edit configuration` control is located at the head of the tab. | REQ-43, REQ-44, REQ-45 | INT-1, INT-2, INT-3 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the environment variables can be read down the keys

- REQ → REQ-18, REQ-19
- Given → a container with several environment variables, its detail open on Config
- When → the operator looks at the environment section
- Then → the section is headed with how many variables there are, and each variable shows its name
  and its value on two aligned tracks, so the names read as one column

### Scenario: a read-only mount is found without reading the whole line

- REQ → REQ-20, REQ-21
- Given → a container with one read-only mount and one writable one
- When → the operator looks at the mounts section
- Then → the section is headed with how many mounts there are, each shows its source, its
  destination and a `ro` or `rw` chip with the two told apart, and no entry starts with the word
  `mount:`

### Scenario: the action that edits the tab sits at the top of the tab

- REQ → REQ-22
- Given → a container's detail open on Config
- When → the operator looks for `Edit configuration`
- Then → it is at the head of the tab, above both columns, and operating it opens the edit form as
  it always did
