---
module: ui-library
component: QuadPanelLayout
type: UI component
---

# QuadPanelLayout

**Purpose** → the four-panel arrangement of a screen whose subject is split into four equally
important inventories (swarm: nodes / services / secrets / configs & stacks): two columns of two
rows, all four panels of the same width.

## Contract

- `<QuadPanelLayout topStart topEnd bottomStart bottomEnd />`
  - the four slots are `ReactNode`, each holding one panel.
  - reading order is `topStart`, `topEnd`, `bottomStart`, `bottomEnd` — the order they keep in the
    DOM, and therefore for the keyboard and for assistive technology, at every viewport width.

Shows:
- two equal columns; `topStart`/`topEnd` on the first row, `bottomStart`/`bottomEnd` on the second.
- below the tablet breakpoint: one column, the four panels stacked in reading order.

## Rules and invariants

- The columns are equal (unlike `DashboardLayout`, whose two columns are deliberately unequal): none
  of the four inventories is the subject of the screen more than the others.
- Panels align at their top edge and each keeps its own height: a long list never stretches the
  panel beside it.
- No panel is ever squeezed below a readable width — the collapse to one column happens instead.
- The layout only places its slots: it gives them no padding, no surface and no title of their own.

## Requirements served

- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
