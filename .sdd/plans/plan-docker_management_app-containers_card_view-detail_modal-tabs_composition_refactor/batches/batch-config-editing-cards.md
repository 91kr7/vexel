---
batch: config-editing-cards
feature: F4 — Config in editing
closed_req: [REQ-23, REQ-24, REQ-25, REQ-26]
depends: [stable-detail-height, config-reading-layout]
---

# Batch — The edit form becomes groups in containers, and says what a save will cost before it is asked for

In editing the tab becomes one long column: four fields on a row, then `Environment variables`,
`Port mappings`, `Mounts` and `Health check` one under the other, separated only by their headings.
No group has a container of its own — they are titles on a continuous ground — and at full screen
the list is taller than the dialog. It is also the point where the 85.2px jump was measured.

**The warning is added, not moved.** Read to the letter the mock takes the recreation warning out of
the post-save confirmation and puts it in the form's footer. Withdrawing an explicit confirmation
before a container is stopped, removed and recreated is a safety decision this request does not make,
so the footer statement is new and the confirmation stays exactly as certified (REQ-26). The human
confirmed on 2026-08-26 that the footer states it **for the whole time the form is in editing** —
what *would* require a recreation — rather than appearing once Environment or Mounts have been
touched.

**A tension worth knowing about before it is discovered.** `FormSection` states that a field group is
**not** a card — no border, background, radius or inset — so that a dialog of groups reads as one
form rather than as a stack of cards inside a card
(`plan-ui-coherence-optimisation/REQ-78`, `REQ-79`, `REQ-81`). This form does not use `FormSection`:
it composes `SectionHeader` directly, and the rule's own component keeps its rule and its consumers.
What F4 changes is this one form's arrangement, and it is recorded as a supersession in
`../batches.md` rather than slipped past.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/controls/FormFooter.tsx` | The footer gains a leading slot for a standing note, so a form can state a consequence beside its save and cancel without its caller drawing a row of its own. A footer given none renders exactly what it renders today, dirty indicator included. | REQ-25 | — |
| INT-2 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in edit mode | Each group of the form — Runtime, Health check, Environment variables, Port mappings, Mounts — sits in a container of its own instead of being a heading on the continuous ground; Runtime and Health check side by side in the library's `pair` arrangement, so they stack at full width when the box cannot carry both, and the other three full width. | REQ-23, REQ-24 | — |
| INT-3 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in edit mode | The form's footer states, for the whole time the form is in editing, that Environment and Mounts changes require the container to be recreated. The save and cancel behaviour, the dirty rule and the disabled-while-saving rule are untouched. | REQ-25 | INT-1 |
| INT-4 | modify | `client/test/unit/container-detail-panel.test.tsx`, `client/e2e/containers.spec.ts` | The post-save confirmation is named and re-asserted unchanged — a change to environment or mounts still asks before the container is stopped, removed and recreated, and declining still abandons the save — beside a check that the footer statement is present from the moment the form opens. The health-check reveal is asserted not to move the dialog, on the form's new arrangement. | REQ-26, REQ-43, REQ-44, REQ-45 | INT-2, INT-3 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the edit form reads as groups instead of one long column

- REQ → REQ-23, REQ-24
- Given → a container's detail open on Config
- When → the operator opens `Edit configuration`
- Then → Runtime and Health check sit side by side, each in a container of its own, with
  Environment variables, Port mappings and Mounts each in one below them

### Scenario: the operator is told what a save will cost while they are still editing

- REQ → REQ-25
- Given → the Config tab in editing
- When → the operator looks at the form's footer
- Then → it states that Environment and Mounts changes require the container to be recreated, and it
  says so from the moment the form opens

### Scenario: the confirmation before a recreate is still asked for

- REQ → REQ-26
- Given → the Config tab in editing, with an environment variable changed
- When → the operator saves
- Then → they are asked to confirm the recreate, naming the container and the consequence, and
  declining leaves the container and its configuration untouched
