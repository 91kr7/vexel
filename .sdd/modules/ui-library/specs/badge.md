---
module: ui-library
component: Badge
type: UI component
---

# Badge

**Purpose** → a small tag/count/status label (e.g. lifecycle state, resource counts).

## Contract

- `<Badge tone? children? onClick?>` — `tone`: `'neutral' | 'success' | 'warning' | 'danger'`
  (default `'neutral'`).
  - `onClick?` — renders the badge as a click target instead of a plain label (e.g. a selection
    action such as "use" next to an "in use" badge for the currently active object, or a usage-state
    label such as "shared" / "in use" / "reclaimable" on a build-cache record).

## Rules and invariants

- A clickable badge stops the click event from propagating, so it never also triggers a containing
  row's own selection.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-91
