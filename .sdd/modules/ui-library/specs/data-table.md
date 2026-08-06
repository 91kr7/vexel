---
module: ui-library
component: DataTable
type: UI component
---

# DataTable

**Purpose** → the dense, column-defined table used by every list screen (containers, images,
volumes, networks, …), with hover/selected row states and virtualised scrolling so a long list
stays smooth (REQ-109).

## Contract

- `<DataTable columns rows rowKey rowHeight? maxHeight? selectedRowKey? onRowSelect? emptyState?
  expandedRowKey? renderExpanded? />`
  - `columns: DataTableColumn<T>[]` — `{ id, header, width?, align?, render(row) }`; `width` is a
    `grid-template-columns` track (default `'1fr'`); `align`: `'start' | 'end'` (default `'start'`).
  - `rows: T[]`, `rowKey(row): string`.
  - `rowHeight?: number` — fixed row height in px (default `56`); every row is this tall (dense
    rows).
  - `maxHeight?: string` — caps the table body height; when set, the body scrolls and only the rows
    in and around the visible window are mounted (virtualised scrolling). Unset renders every row.
  - `selectedRowKey?: string`, `onRowSelect?(row)` — clicking a row calls `onRowSelect`; the row
    whose key matches `selectedRowKey` renders in its selected state.
  - `emptyState?: ReactNode` — shown instead of the header/body rows when `rows` is empty.
  - `expandedRowKey?: string`, `renderExpanded?(row)` — when a row's key matches `expandedRowKey`,
    that row is always kept mounted (even outside the naive virtualisation window) and
    `renderExpanded(row)`'s content is inserted in normal flow directly below it (e.g. a detail
    panel), pushing the rows after it down.

## Rules and invariants

- A row's height never changes with scroll position: virtualisation swaps which rows are mounted,
  not their layout, so scrolling never recomputes the glass material (REQ-109).
- Every column in `columns` renders in the header and in every row, in the same order and using the
  same `width`/`align`.
- Virtualisation only accounts for the fixed `rowHeight` of each row when reserving scroll-window
  space; an expanded row's extra height is not reserved (spacer heights stay an approximation).
  Acceptable for the moderate list sizes this table serves; a future batch revisits it if a screen
  needs both virtualisation and expansion at very large row counts.
- The row matching `expandedRowKey` is never unmounted by virtualisation while it remains in
  `rows`, regardless of scroll position: its component instance (and therefore its internal state,
  e.g. an in-progress edit) survives scrolling.

## Dependencies

- ScrollArea

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-109
