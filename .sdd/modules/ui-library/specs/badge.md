---
module: ui-library
component: Badge
type: UI component
---

# Badge

**Purpose** → a small tag/count/status label (e.g. lifecycle state, resource counts), and the pair
of treatments that lets two attributes of one object sit side by side without competing (a console
entry's channel next to its exit status).

## Contract

- `<Badge tone? variant? children?>`
  - `tone`: `'neutral' | 'info' | 'success' | 'warning' | 'danger'` (default `'neutral'`); `info`
    carries the accent role — an attribute that classifies rather than warns (e.g. a channel such as
    "CLI" or a kind such as "regular").
  - `variant`: `'solid' | 'quiet'` (default `'solid'`). `solid` is the filled pill. `quiet` drops the
    fill and renders the label in muted monospace, keeping its tone as the text colour — a secondary
    attribute reading (e.g. a console entry's channel beside its status, or a count beside a
    section's title) that must not read as a second pill next to the first.
## Rules and invariants

- **A badge is a statement, never a control.** It carries no activation of its own and offers no way
  to become one: a caller that wants a pill the operator can press asks `ActionButtonGroup` for an
  action with a weight (`plan-ui-coherence-optimisation/REQ-27`). The clickable presentation the
  component used to offer — a badge that looked like a label and behaved like a button, told apart
  by a hover fill alone — was removed with its last consumer
  (`plan-ui-coherence-optimisation/REQ-82`).
- `tone` and `variant` are independent: every tone is available in both variants.
- Both variants keep the same height and vertical alignment, so a solid and a quiet badge on the
  same row sit on one baseline.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-91
- plan-ui-coherence-optimisation/REQ-82
