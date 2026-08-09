---
module: ui-library
component: Badge
type: UI component
---

# Badge

**Purpose** → a small tag/count/status label (e.g. lifecycle state, resource counts), and the pair
of treatments that lets two attributes of one object sit side by side without competing (a swarm
node's role next to its availability).

## Contract

- `<Badge tone? variant? children? onClick?>`
  - `tone`: `'neutral' | 'info' | 'success' | 'warning' | 'danger'` (default `'neutral'`); `info`
    carries the accent role — an attribute that classifies rather than warns (e.g. a role such as
    "manager" or a mode such as "replicated").
  - `variant`: `'solid' | 'quiet'` (default `'solid'`). `solid` is the filled pill. `quiet` drops the
    fill and renders the label in muted monospace, keeping its tone as the text colour — a secondary
    attribute reading (e.g. an availability such as "active" / "drain") that must not read as a
    second pill next to the first.
  - `onClick?` — renders the badge as a click target instead of a plain label (e.g. a selection
    action such as "use" next to an "in use" badge for the currently active object, or a usage-state
    label such as "shared" / "in use" / "reclaimable" on a build-cache record).

## Rules and invariants

- A clickable badge stops the click event from propagating, so it never also triggers a containing
  row's own selection.
- `tone` and `variant` are independent: every tone is available in both variants.
- Both variants keep the same height and vertical alignment, so a solid and a quiet badge on the
  same row sit on one baseline.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-91
