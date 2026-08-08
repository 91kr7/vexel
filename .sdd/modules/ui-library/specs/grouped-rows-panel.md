---
module: ui-library
component: GroupedRowsPanel
type: UI component
---

# GroupedRowsPanel

**Purpose** → one card per group with a header carrying its own actions, over its indented child
rows each carrying a trailing control — e.g. a compose project and its services.

## Contract

- `<GroupedRowsPanel groups selectedGroupId? onSelectGroup? emptyState? />`
  - `groups: { id, tone?, title, subtitle?, actions?, rows }[]`
    - `tone?: StatusTone` — status dot in the header.
    - `actions?: ReactNode` — rendered trailing the header's title/subtitle (e.g. a status pill and
      lifecycle buttons); clicks inside it never trigger `onSelectGroup`.
    - `rows: { id, tone?, title, subtitle?, trailing? }[]` — `tone?` colors that row's own status
      dot; `trailing?: ReactNode` is that row's trailing control (e.g. a `Stepper`).
  - `selectedGroupId?: string`, `onSelectGroup?: (group) => void` — clicking a group's header (outside
    its `actions`) calls `onSelectGroup` when given.
  - `emptyState?: ReactNode` — shown instead of any card when `groups` is empty.

Shows:

- for each group: a status dot, title, optional subtitle and its `actions`, then its `rows` indented
  below, each with its own status dot, title, optional muted subtitle and `trailing` control.

## Dependencies

- Surface, Row, Stack, Spacer, Divider, StatusDotCell, EmptyState

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
