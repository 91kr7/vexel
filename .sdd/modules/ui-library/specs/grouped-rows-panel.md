---
module: ui-library
component: GroupedRowsPanel
type: UI component
---

# GroupedRowsPanel

**Purpose** → one card per group with a header carrying its own actions, over its indented child
rows each carrying a trailing control — e.g. a compose project and its services.

**Retiring.** It is not the answer to "how is a grouped list presented": `DataTable`'s comfortable
variant is, with the group's children in `renderRowContent` as a nested `hideHeader` comfortable
list. That composition shares the row rendering, the column contract, the action cluster and the
truncation contract instead of duplicating them, and it exists today — no new API is needed to reach
it. This component has one call site (compose), which migrates in batch 11 of
`plan-ui-coherence-optimisation`; the component, its export, its stylesheet and this spec go with
that migration. It is left rendering exactly as delivered until then, because rebuilding its
internals in the foundation batch would move the one screen that uses it, which that batch forbids
(REQ-30).

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
- plan-ui-coherence-optimisation/REQ-22
