---
module: ui-library
component: StateSummaryBar
type: UI component
---

# StateSummaryBar

**Purpose** → a single full-width bar stating the condition of a whole subsystem — a state dot, the
state in words, the identifiers and readings that qualify it, and the actions that change it — sat
above the panels that detail that subsystem.

## Contract

- `<StateSummaryBar tone? title facts? actions? />`
  - `tone?: StatusTone` (default `neutral`) — colours the leading dot.
  - `title: string` — the state in words (e.g. "Swarm active", "Swarm inactive").
  - `facts?: string[]` — the qualifying readings, rendered as one muted monospace line with the
    entries separated by `·`, in the order given; an empty or absent list renders no line.
  - `actions?: ReactNode` — trailing slot, right-aligned on the same row.

Shows:
- a leading dot in `tone`, the `title` in bold beside it, and the `facts` line underneath.
Actions:
- none of its own: every action is whatever the caller puts in `actions`.

## Rules and invariants

- The bar is one glass surface of its own, never a card with a section header: it reads as a status
  strip, not as a panel of content.
- It states a condition even when there is nothing to detail: a caller with no facts still gets the
  dot, the title and its actions, so a subsystem that is off is announced rather than left blank.
- Below the tablet breakpoint the actions wrap under the text instead of squeezing the title.
- The component holds no state: tone, title, facts and actions are all the caller's.

## Dependencies

- Surface, Row, StatusDotCell

## Requirements served

- plan-docker_management_app/REQ-79
