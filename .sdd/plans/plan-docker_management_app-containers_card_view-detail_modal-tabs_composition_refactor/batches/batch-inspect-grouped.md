---
batch: inspect-grouped
feature: F6b — Inspect grouped, and a bad exit code that reads as one
closed_req: [REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45]
depends: [stable-detail-height]
---

# Batch — Two questions instead of one list, and the last batch of the plan

Ten properties in a single list, in which `Id`, `Name`, `Image`, `Command`, `Entrypoint` and
`Created` say **what** the container is, while `State`, `Started at`, `Finished at` and `Exit code`
say **how it has gone**. Two different questions presented as one list — and `Exit code`, the only
one of them that can carry bad news, is the last row, drawn exactly like the nine above it. The raw
payload is meanwhile the one section always open, taking 320px at the foot of every Inspect.

**This is the plan's last batch, so it also closes the eight cross-cutting requirements** (REQ-38 …
REQ-45), which every batch before it honoured and none of them closed. Nothing is deferred to here:
what closes here is the *statement* that they hold across the whole recomposition, verified once over
all seven tabs.

**What must not be lost**: `plan-ui-coherence-optimisation/REQ-65` names the raw payload as **real
selectable text** among the three things this panel must not lose, and
`plan-docker_management_app-remove_copy_controls/REQ-19` records hand-selection inside that block as
the accepted way to obtain the full container id. Collapsed by default is not a loss of either — the
text is the same text, in full, once the section is open — and the rule that a collapsible section
with nothing in it is not drawn (`plan-ui-coherence-optimisation/REQ-60`) goes on applying to the
sections around it.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Inspect tab | The ten properties split into two headed groups — `Identity` (what the container is) and `Lifecycle` (how it has gone) — each stating its own content class, so the number of columns each shows goes on following that section's own width. | REQ-34 | — |
| INT-2 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Inspect tab | `State` is drawn as the state pill rather than as a word among the values, and a non-zero exit code is drawn in the application's danger tone while a zero one carries none. | REQ-35, REQ-36 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Inspect tab | The raw payload becomes a collapsible section like the tab's others, collapsed when the tab opens, and its content is still the whole payload as real selectable text with no action of its own. | REQ-37 | — |
| INT-4 | modify | `client/e2e/containers.spec.ts`, `client/e2e/container-detail-property-columns.spec.ts`, `client/e2e/copy-affordance-absence.spec.ts`, `client/test/unit/container-detail-panel.test.tsx` | The checks that read the ten properties as one flat list are rewritten against the two groups rather than deleted; the payload's selectability and the absence of every copy affordance are re-asserted through the now-collapsed section; the certified column-count rule is re-asserted on the two new sections; a check asserts a non-zero exit code is toned and a zero one is not. | REQ-41, REQ-42, REQ-43, REQ-44, REQ-45 | INT-1, INT-2, INT-3 |
| INT-5 | modify | `client/e2e/` — the container detail's own specs, and the conformance and blur passes left unedited (`client/scripts/check-ui-conformance.mjs`) | The plan's closing pass: at 375×812 every one of the seven tabs is reached with a real pointer, no value is clipped to nothing, the terminal and the log views are operable and nothing scrolls horizontally; the UI-boundary and blur passes are asserted green with the allow-list and the check script unedited, no new blurring selector, no new blur value and no new exception comment anywhere in the plan's diff. | REQ-38, REQ-39, REQ-40, REQ-45 | INT-4 |

## Human acceptance

### Scenario: what the container is, and how it has gone, read as two questions

- REQ → REQ-34, REQ-35
- Given → a container's detail open on Inspect
- When → the operator looks at the properties
- Then → they are under two headings, `Identity` and `Lifecycle`, and the state under `Lifecycle`
  reads as a pill rather than as a plain word

### Scenario: a container that was killed says so

- REQ → REQ-36
- Given → a container that exited with a non-zero code, and one that exited cleanly
- When → the operator opens Inspect on each
- Then → the non-zero exit code is drawn as bad news, and the zero one is drawn like any other value

### Scenario: the raw payload is there when it is wanted and out of the way when it is not

- REQ → REQ-37
- Given → a container's detail open on Inspect
- When → the operator looks at the foot of the tab, then opens the raw payload section
- Then → the section is closed to begin with, like the others, and opening it shows the whole
  payload as text the operator can select by hand

### Scenario: the whole detail is usable on a phone-sized screen

- REQ → REQ-40
- Given → a viewport of 375×812
- When → the operator opens a running container's detail and visits each of the seven tabs
- Then → every tab is reachable, no value is cut down to nothing, the log view and the terminal can
  be operated, and nothing has to be scrolled sideways

### Scenario: nothing about the detail's data or operations changed across the plan

- REQ → REQ-41, REQ-42
- Given → a container whose detail is open
- When → the operator streams its logs, watches its statistics, edits its configuration and then
  removes the container from its card's menu
- Then → the same data, the same operations and the same confirmations as before; the dialog states
  that the container no longer exists, both ways out still work, and nothing is left streaming
