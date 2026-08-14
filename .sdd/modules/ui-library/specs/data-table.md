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
  expandedRowKey? renderExpanded? selection? hideHeader? autoRowHeight? />`
  - `columns: DataTableColumn<T>[]` — `{ id, header, width?, minWidth?, align?, render(row) }`;
    `width` is a `grid-template-columns` track (default `'1fr'`); `align`: `'start' | 'end'`
    (default `'start'`).
  - `minWidth?: string` — the width that column may never resolve below. Omitted, a **flexible**
    `width` (`'1fr'`, `'1.8fr'`, …) takes the flex factor times `--data-table-column-min-width`,
    and any other `width` — a length, an already-written `minmax()` — is its own minimum and is
    used as given.
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
  - `selection?: { selectedKeys: string[], onToggle(row), onToggleAll?(), allSelected? }` — adds a
    leading checkbox column, independent of `onRowSelect`'s single-row selection: a row's checkbox
    calls `onToggle` and reflects membership in `selectedKeys`; the header checkbox calls
    `onToggleAll` (omit to disable it) and reflects `allSelected`.
  - `hideHeader?: boolean` (default `false`) — drops the header row entirely, for a short list
    whose columns need no naming (e.g. an overview panel); the rows, their tracks and their
    alignment are unchanged, and the multi-select header checkbox goes with the header.
  - `autoRowHeight?: boolean` (default `false`) — the matrix variant: every row grows to fit its
    content instead of being clipped, `rowHeight` becoming a minimum rather than a fixed height,
    and the cells align to the top of the row. For a reference table whose cells carry text that
    reads as a sentence (e.g. the coverage matrix) rather than a dense list of one-line values.
    Virtualisation is off in this mode — a row's height is not known before it is rendered — so
    every row is mounted; `maxHeight` still caps the body and scrolls it.

Description:

- The list region declares itself the **dismissal focus target** of everything inside it (the
  attribute described in `escape-arbitration.md`): when a surface expanded in the table is dismissed
  by `Escape` rather than by a control of its own, the point of interaction lands on the list rather
  than on the removed content or on the document.
- Given more width than its columns' minimums require, the table divides it between them exactly as
  the `width` tracks say — the delivered desktop layout, unchanged. Given less, the columns stop at
  their minimums and **the table pans horizontally**: it is the list region itself (`.ui-data-table`)
  that scrolls, reporting `scrollWidth > clientWidth`, and dragging it brings every column fully
  into view. Header and rows pan together.

## Rules and invariants

- The list region is **programmatically focusable only**: it takes focus when a dismissal hands it
  focus, and it adds **no stop to the tab order** — `Tab` walks the screen exactly as it did before
  it became a target. Its focus is shown for the keyboard alone, so a pointer-driven dismissal draws
  no ring that could be read as the list being selected.
- Rows themselves are **not keyboard-operable**: a row carries no tab stop, no role, no key handling
  and does not announce an expanded state. A recorded limitation, deliberately left as it is.
- Only the checkbox control's own click is swallowed before it reaches `onRowSelect`; the rest of
  its column cell behaves like any other cell and still selects/expands the row.
- A row's height never changes with scroll position: virtualisation swaps which rows are mounted,
  not their layout, so scrolling never recomputes the glass material (REQ-109).
- Every column in `columns` renders in the header and in every row, in the same order and using the
  same `width`/`align`; with `hideHeader` the rows keep exactly those tracks.
- **No column ever resolves to zero width, at any viewport.** A track carries the minimum stated
  above and stops there; a cell's content is then truncated within its column, never squeezed out of
  existence. Scaling a flexible column's minimum by its own flex factor is what makes a compressed
  table keep the proportions it was declared with rather than equalising every column.
- **A row and the header share one width and one set of resolved tracks**, so a column and the label
  naming it are aligned at every pan offset — measured as identical `x` for every header cell and
  its row cell, at `scrollLeft` 0 and at the end of the pan. Both grow to the width their columns
  need; the body's own scroll region grows with them and therefore never scrolls horizontally itself
  (it keeps `maxHeight`'s vertical scrolling, unchanged).
- **A row does not clip on the inline axis**: its overflow is the table's to scroll, not the row's
  to hide. It still clips on the block axis, which is what the delivered clipping was actually
  protecting — content taller than the fixed `rowHeight` is cut rather than spilling into the row
  below.
- When the table pans, the expanded row's content (`renderExpanded`) is laid out at the same width
  as the rows and pans with them: it is part of the table's scrollable content, not a second region
  beside it. Above the width where the minimums bind — every desktop width — nothing about it
  changes.
- The column minimums are the library's, so **every screen inherits them by construction**: no
  screen declares a minimum, a breakpoint-conditional column set or a width to compensate.
- Virtualisation only accounts for the fixed `rowHeight` of each row when reserving scroll-window
  space; an expanded row's extra height is not reserved (spacer heights stay an approximation).
  Acceptable for the moderate list sizes this table serves; a future batch revisits it if a screen
  needs both virtualisation and expansion at very large row counts.
- The row matching `expandedRowKey` is never unmounted by virtualisation while it remains in
  `rows`, regardless of scroll position: its component instance (and therefore its internal state,
  e.g. an in-progress edit) survives scrolling.
- A row's content that exceeds its fixed `rowHeight` is clipped, never grows the row or spills into
  the row below — unless `autoRowHeight` is set, which is exactly the trade this variant makes:
  rows of differing heights, and no virtualisation, in exchange for text shown in full.
- `autoRowHeight` and virtualisation are never both in effect: with `autoRowHeight` set, `maxHeight`
  scrolls the body but mounts every row.

## Dependencies

- ScrollArea
- Design tokens (`--data-table-column-min-width`, the two action-column widths)
- Escape arbitration (the dismissal focus target attribute)

## Requirements served

- plan-docker_management_app-container_detail_close/REQ-11
- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-109
- plan-docker_management_app/REQ-15
- plan-docker_management_app/REQ-105
- plan-ui-coherence-optimisation/REQ-6
- plan-ui-coherence-optimisation/REQ-7
- plan-ui-coherence-optimisation/REQ-8
- plan-ui-coherence-optimisation/REQ-9
- plan-ui-coherence-optimisation/REQ-10
- plan-ui-coherence-optimisation/REQ-11
