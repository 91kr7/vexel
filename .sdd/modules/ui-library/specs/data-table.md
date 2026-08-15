---
module: ui-library
component: DataTable
type: UI component
---

# DataTable

**Purpose** → **the object list of the whole product**, in two densities: the column-defined table
used by every list screen (containers, images, volumes, networks, …), with hover/selected row
states and virtualised scrolling so a long list stays smooth (REQ-109).

**The one question it answers** → *how is a list of objects presented?* There is one answer, and
`variant` is a choice of density inside it, never a choice between two components. A screen that
wants roomier rows asks for `variant="comfortable"`; there is no second list to reach for, and the
list that used to be that second answer (`CardList`) is being retired against a pinned call-site
budget in `ui-conformance-check.md`.

## Contract

- `<DataTable columns rows rowKey variant? rowHeight? maxHeight? selectedRowKey? onRowSelect?
  emptyState? expandedRowKey? renderExpanded? renderRowContent? selection? hideHeader?
  autoRowHeight? />`
  - `columns: DataTableColumn<T>[]` — `{ id, header, width?, minWidth?, align?, render(row) }`;
    `align`: `'start' | 'end'` (default `'start'`).
  - `width?: DataTableColumnWidth` (default `'1fr'`) — the column's track, as a **closed** set of
    forms: `'<n>fr'`, `'<n>px'`, or `'var(--token)'` holding one of those. **An intrinsic width is
    refused, and refused at the type**: `'max-content'`, `'min-content'`, `'auto'`,
    `'fit-content()'` and a hand-written `'minmax()'` (which could carry one) do not compile. A
    column that wants "as wide as its content" states the width it measured.
  - `minWidth?: DataTableColumnWidth` — the width that column may never resolve below. Omitted, a
    **flexible** `width` (`'1fr'`, `'1.8fr'`, …) takes the flex factor times
    `--data-table-column-min-width`, and a length `width` is its own minimum and is used as given.
    Stated with a flexible `width`, it is the floor and the component writes the `minmax()` itself.
  - `rows: T[]`, `rowKey(row): string`.
  - `variant?: 'dense' | 'comfortable'` (default `'dense'`) — how much room a row is given:
    - `'dense'` — the delivered fixed-height row in a continuous ruled grid, virtualised.
    - `'comfortable'` — each row on a flat glass card of its own, separated rather than ruled,
      growing to fit its content. The shape for a list whose row is a title over a monospace
      subtitle with trailing badges and meta values: those are the existing `TableCells`
      (`TwoLineCell`, `StatusDotCell`, `BadgeListCell`, `MetaCell`) placed in columns, not a second
      row model. An active-selection set — one row "in use" among several — is a status column
      carrying the marker plus a `'primary'`-weight `use` action in the row's `ActionButtonGroup`;
      the list offers no separate affordance for it, because a control that switches something is an
      action and belongs where actions live.
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
  - `renderRowContent?(row)` — content rendered inside **every** row's card, below its cells and
    outside the selectable row itself (chips with their own actions, a nested list). Comfortable
    rows only; a dense row is a fixed-height line and ignores it. A **grouped list** is this slot
    holding a nested `hideHeader` comfortable list of the group's children — one list rendering
    both levels, sharing its rows, its action cluster and its truncation contract rather than a
    grouped component duplicating them.
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
  into view. Header and rows pan together; an open expansion does not pan — it holds the visible
  box.

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
  its row cell, on **every** row, at `scrollLeft` 0 and at the end of the pan. Both grow to the width
  their columns need; the body's own scroll region grows with them and therefore never scrolls
  horizontally itself (it keeps `maxHeight`'s vertical scrolling, unchanged).
- **That is a guarantee, and it rests on two things, because the table is not one grid**: the header
  is a grid and every row is a grid of its own, each handed the same template string.
  - **Every admissible `width` resolves independently of content**, which is why the intrinsic ones
    are refused above. An intrinsic track resolves against its own container's cell content, so it
    takes one value in the header and another in every row whose content differs — and the free
    space the flexible tracks divide moves with it, carrying every other column in that row.
    Measured with the intrinsic tracks the migrations had written: the registries action column
    57.4px in the header, 50.7px on a `Log in` row and 58.0px on a `Log out` row, putting
    `CREDENTIAL STORE` at x 585.3 / 588.5 / 584.3 on one screen; the networks one 57.4px against
    130.7px, carrying its `NAME` column 46px out of line; and, probed on the **dense** images table,
    112.3px in the header against 136.8px and 164.0px on two kinds of row. All of them now resolve to
    a single track string, header and rows alike.
  - **The comfortable header takes the row's own inline inset** (`--space-5` plus the carrier
    `Surface`'s hairline), the comfortable row being padded more than the dense one and sitting
    inside a bordered card. Without it the two grids differ by 10px in width and every flexible track
    with them: measured at 1440×1000, header cells at 349/449/652.5/808.1/987.6/1119.3/1251 against
    row cells at 354/454/654.9/808.6/985.9/1115.9/1246.
- **A row does not clip on the inline axis**: its overflow is the table's to scroll, not the row's
  to hide. It still clips on the block axis, which is what the delivered clipping was actually
  protecting — content taller than the fixed `rowHeight` is cut rather than spilling into the row
  below.
- **An expansion is never wider than the box the table is read in, and never pans.** While the table
  pans, `renderExpanded`'s content keeps the width of the table's own visible box and stays in it as
  the grid pans underneath: its left edge holds the table's left edge at every scroll offset.
  A row is a grid to be scanned across; a panel is prose and values to be read, and a panel that has
  to be panned to be read is worse than a panel scrolled vertically. This is what keeps the property
  arrangement inside it (`ContentColumns`, `plan-docker_management_app-detail_property_columns`)
  seeing the width the window actually offers — measured identical to the width before this
  component gained its minimums, at 375, 460, 640, 700, 720, 940, 1280 and 1440.
- Where the columns fit, the expansion carries **no geometry of the component's own** and lays out
  as it always did — the delivered case, unchanged, at every desktop width.
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
  scrolls the body but mounts every row. **`variant="comfortable"` makes the same trade for the same
  reason** — a row that grows to fit its content has no height known before it is rendered — so a
  comfortable list mounts every row and `maxHeight` still scrolls it.
- **The two variants differ in the room a row is given and the surface it is drawn on, and in
  nothing else.** Both resolve their columns through the same tracks and the same minimums, both pan
  rather than starve a column, both draw their cells with the same `TableCells` and therefore the
  same truncation contract, both expand one row at a time. A screen choosing a variant chooses a
  density, never a set of behaviours — which is what makes the nine screens migrating onto the
  comfortable variant inherit the column repair by construction, without any of them stating a
  column minimum.
- **A comfortable row, the content it always carries and the panel it expands into are one card**
  (a flat `Surface`): the row inside it draws no rule and rounds nothing of its own, and the
  expansion is set apart from the row by a hairline rather than by the wash the dense variant uses,
  the card already setting it apart from the list around it.
- **At most one row is expanded in one list**, by construction: `expandedRowKey` is one key, so a
  list cannot present two open panels. The half of that guarantee spanning *several* lists on one
  screen is `DetailPanel`'s, which closes the panel a previous list left open.
- A comfortable row carries no pointer cursor of its own — the same as a dense row, which is also
  clickable. One list, one affordance.

## Dependencies

- ScrollArea
- Surface (the card a comfortable row is drawn on)
- Design tokens (`--data-table-column-min-width`, the two action-column widths)
- Escape arbitration (the dismissal focus target attribute)
- Truncation contract, through the `TableCells` a caller renders into its columns

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
- plan-ui-coherence-optimisation/REQ-22
- plan-ui-coherence-optimisation/REQ-24
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30
