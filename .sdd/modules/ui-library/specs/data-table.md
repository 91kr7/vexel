---
module: ui-library
component: DataTable
type: UI component
---

# DataTable

**Purpose** → **the object list of the whole product, in one presentation**: the column-defined
table used by every list screen (containers, images, volumes, networks, …) — one table surface, one
column header at its top, ruled rows beneath it — with hover/selected row states and virtualised
scrolling so a long list stays smooth (REQ-109).

**The one question it answers** → *how is a list of objects presented?* There is one answer, and it
is not parameterised: no screen chooses a surface, a density or a row treatment. The list that used
to be a second answer was retired onto this one and deleted, export, stylesheet and spec together
(`plan-ui-coherence-optimisation/REQ-82`); the card-per-row presentation that was a *variant* of
this one — each row on a card of its own under a floating header — was retired the same way on
2026-08-16, prop, carrier surface, stylesheet rules and header-inset compensation together
(`.../classic-table/REQ-1`, `REQ-22`). Reintroducing either fails `npm run lint`
(`ui-conformance-check.md`).

## Contract

- `<DataTable columns rows rowKey rowHeight? maxHeight? selectedRowKey? onRowSelect?
  emptyState? expandedRowKey? renderExpanded? renderRowContent? selection? hideHeader? nested?
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
  - `rowHeight?: number` — fixed row height in px (default `56`); every row is this tall.
  - `maxHeight?: string` — caps the height of the **list**, the column header and the rows together;
    when set, the list scrolls and only the rows in and around the visible window are mounted
    (virtualised scrolling). Unset renders every row. **Corrected 2026-08-16**: it bounded the rows
    alone, the header standing above the cap, so a list stated at `60vh` was 60vh plus a header
    tall. The header is now inside the box that scrolls — see "A row and the header share one width"
    below, which is why — and the cap covers both.
  - `selectedRowKey?: string`, `onRowSelect?(row)` — clicking a row calls `onRowSelect`; the row
    whose key matches `selectedRowKey` renders in its selected state.
  - `emptyState?: ReactNode` — shown instead of the header/body rows when `rows` is empty.
  - `expandedRowKey?: string`, `renderExpanded?(row)` — when a row's key matches `expandedRowKey`,
    that row is always kept mounted (even outside the naive virtualisation window) and
    `renderExpanded(row)`'s content is inserted in normal flow directly below it (e.g. a detail
    panel), pushing the rows after it down.
  - `renderRowContent?(row)` — content rendered inside **every** row, below its cells and outside
    the selectable row itself (chips with their own actions, a nested list). **Conditional on
    nothing at all**, as `renderExpanded` beside it: a list that supplies it gets it. It was once
    read only where the retired card-per-row presentation was asked for, which is a gate a list
    converted away from that presentation would have lost its content to — with no error, no type
    change and no shorter list, only shorter rows (`.../classic-table/REQ-6`). A **grouped list** is
    this slot holding a `nested` (and usually `hideHeader`) list of the group's children — one list
    rendering both levels, sharing its rows, its action cluster and its truncation contract rather
    than a grouped component duplicating them.
  - `selection?: { selectedKeys: string[], onToggle(row), onToggleAll?(), allSelected? }` — adds a
    leading checkbox column, independent of `onRowSelect`'s single-row selection: a row's checkbox
    calls `onToggle` and reflects membership in `selectedKeys`; the header checkbox calls
    `onToggleAll` (omit to disable it) and reflects `allSelected`.
  - `hideHeader?: boolean` (default `false`) — drops the header row entirely, for a short list
    whose columns need no naming (e.g. an overview panel); the rows, their tracks and their
    alignment are unchanged, and the multi-select header checkbox goes with the header.
  - `nested?: boolean` (default `false`) — this list is drawn **inside a row of another list**, in
    that row's `renderRowContent` slot, rather than on a screen of its own. It takes **no surface,
    corner, outline or shadow of its own**: it stays inside the surface its parent row is drawn in,
    shares that list's pan region, is ruled between its rows with the same hairline as any other
    row, and its rows are **inset** from the parent row's own cells. It keeps the columns it
    declares — what is shared is the surface, the pan region and the ruled treatment, never the
    tracks. Stated with `hideHeader` where the child's columns need no naming, but the two are
    independent.
  - `autoRowHeight?: boolean` (default `false`) — content-sized rows: every row grows to fit its
    content instead of being clipped, `rowHeight` becoming a minimum rather than a fixed height,
    and the cells align to the top of the row. For a reference table whose cells carry text that
    reads as a sentence (e.g. the coverage matrix) rather than a list of one-line values.
    Virtualisation is off in this mode — a row's height is not known before it is rendered — so
    every row is mounted; `maxHeight` still caps the body and scrolls it.
    **An object list does not state it, and a second line is not a reason to**: the two-line cell —
    a title over a monospace subtitle — sits unclipped inside the fixed row the reference lists use,
    so a list stating it is a reference table and not an inventory (`.../classic-table/REQ-39`).
    Which feature files may state it is pinned, with the reason per entry, in
    `test/unit/library-layer-adoption-perimeter.test.ts`.

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
  naming it are aligned at every pan offset **and at every scroll position** — measured as identical
  `x` for every header cell and its row cell, on **every** row, at `scrollLeft` 0 and at the end of
  the pan, on a list that scrolls vertically and on one that does not. Both grow to the width their
  columns need; the list's scroll region grows with them and therefore never scrolls horizontally
  itself (it keeps `maxHeight`'s vertical scrolling, unchanged).
- **That is a guarantee, and it rests on three things, because the table is not one grid**: the
  header is a grid and every row is a grid of its own, each handed the same template string.
  - **The header and the rows are inside one scrolling box**, the header sticky at its top. A
    vertical scrollbar takes real layout space out of its scroll container's content box, so a
    header drawn as a *sibling* of that container resolves its tracks in a wider box than the rows
    do, and the flexible tracks redistribute the difference across every column after the first.
    Measured at 1440×1000 before this: header box 1118px against body box 1107px, and header-to-body
    left edges `PLUGIN 0 · VERSION 4.53 · AVAILABILITY 4.53 · WHY UNAVAILABLE 4.53`; on the images
    list, `REPOSITORY:TAG 0 · DIGEST 4.25 · PLATFORM 6.03 · DISK USAGE 7.80 · CREATED 9.22 ·
    ACTIONS 10.98`. One code path, so the lists every other list is held equal to carried it too,
    and looked clean only where the operator had too few objects to make a list scroll. Inside one
    box the scrollbar is outside both grids and both read 1107px. **Padding the header by the
    scrollbar's width is refused**: a compensating inset was the retired presentation's own
    signature, and **no compensating inset exists anywhere in the library** — the header and the
    rows take the same `--space-4`, so the alignment is structural rather than corrected
    (`.../classic-table/REQ-5`). `scrollbar-gutter: stable` cannot do it either — it applies to
    scroll containers, and a sibling header is not one.
  - The sticky header is **opaque only while the list is scrolled away from its top**, carrying a
    state class for it: its own wash is 4% white and hides nothing, and a list that never scrolls is
    drawn exactly as before. It paints above the rows *and* above the expansion, which is positioned
    and comes later in the DOM.
  - **Every admissible `width` resolves independently of content**, which is why the intrinsic ones
    are refused above. An intrinsic track resolves against its own container's cell content, so it
    takes one value in the header and another in every row whose content differs — and the free
    space the flexible tracks divide moves with it, carrying every other column in that row.
    Measured with the intrinsic tracks the migrations had written: the registries action column
    57.4px in the header, 50.7px on a `Log in` row and 58.0px on a `Log out` row, putting
    `CREDENTIAL STORE` at x 585.3 / 588.5 / 584.3 on one screen; the networks one 57.4px against
    130.7px, carrying its `NAME` column 46px out of line; and, probed on the images table,
    112.3px in the header against 136.8px and 164.0px on two kinds of row. All of them now resolve to
    a single track string, header and rows alike.
  - **The header and the rows are inset identically, by construction** — the same `--space-4` on
    both, so the two grids are laid in content boxes of the same width and no rule corrects for a
    difference. The retired presentation needed such a correction, its rows being padded more than
    the header and sitting inside bordered cards, and that rule was deleted with it: measured at
    1440×1000 before the correction existed, header cells at 349/449/652.5/808.1/987.6/1119.3/1251
    against row cells at 354/454/654.9/808.6/985.9/1115.9/1246. **The existence of such a
    compensation is the defect's own signature**, which is why the alignment is now stated
    structurally and a left-edge measurement alone is not evidence of the repair
    (`.../classic-table/REQ-5`, and that plan's amendment to `REQ-18`).
- **A row does not clip on the inline axis**: its overflow is the table's to scroll, not the row's
  to hide. It still clips on the block axis, which is what the delivered clipping was actually
  protecting — content taller than the fixed `rowHeight` is cut rather than spilling into the row
  below.
- **An expansion is never wider than the box the table is read in, and never pans.** While the table
  pans, `renderExpanded`'s content keeps the width of the table's own visible box and stays in it as
  the grid pans underneath: its left edge holds the table's own left edge at every scroll offset
  (`x=21` against a pan region at `x=21`). It was one hairline in from it while the row was drawn
  inside a card of its own (`x=54` against `x=53`), the expansion living inside that card; with the
  card gone the two coincide on every list.
  - **The offset is written from the pan region's scroll event**, not declared as a sticky inset —
    `position: sticky` resolves against the body's own region, which never scrolls horizontally, and
    `transform` would make the expansion the containing block of any `position: fixed` descendant, a
    dialog opened from a panel being rendered in place. The consequence is a property of that
    choice: the pin is applied in the scroll event's own frame, so
    a probe that reads the box in the same tick as a programmatic `scrollLeft =` assignment reads the
    un-pinned position — measured at 375×812, `x=-199` on the build cache, `-170` on volumes and
    `-369` on the images table, all three back at their resting `x` two frames later. Driven as
    a pointer drives it, the box does not move at all: sampled through a real wheel scroll at
    `scrollLeft` 80/160/240/253, the expansion held its resting `x` at every sample.
  A row is a grid to be scanned across; a panel is prose and values to be read, and a panel that has
  to be panned to be read is worse than a panel scrolled vertically. This is what keeps the property
  arrangement inside it (`ContentColumns`, `plan-docker_management_app-detail_property_columns`)
  seeing the width the window actually offers — measured identical to the width before this
  component gained its minimums, at 375, 460, 640, 700, 720, 940, 1280 and 1440.
- Where the columns fit, the expansion carries **no geometry of the component's own** and lays out
  as it always did — the delivered case, unchanged, at every desktop width.
- **The column minimums are the library's, and no screen restates them or works around them.** The
  default floor (`--data-table-column-min-width`) and its scaling by a column's flex factor are the
  component's, applied by construction; no screen declares them again, states a
  breakpoint-conditional column set, or writes a width to compensate for a column the component
  failed to size. That is the line REQ-10 draws.
  - **A caller may declare `minWidth` for a column whose content it knows**, and the component still
    resolves the track (it writes the `minmax()`). A screen saying "this column holds a process
    command, so it needs at least 240px" is domain knowledge the screen owns and the library cannot
    have; it is not a hand-tuned width, and it is the prop's stated purpose since it was added.
    `ContainerProcessesView`'s `Command` column is the case this is written for — the only caller in
    the client that declares one.
- Virtualisation only accounts for the fixed `rowHeight` of each row when reserving scroll-window
  space; an expanded row's extra height is not reserved (spacer heights stay an approximation).
  Acceptable for the moderate list sizes this table serves; a future batch revisits it if a screen
  needs both virtualisation and expansion at very large row counts.
- The row matching `expandedRowKey` is never unmounted by virtualisation while it remains in
  `rows`, regardless of scroll position: its component instance (and therefore its internal state,
  e.g. an in-progress edit) survives scrolling.
- A row's content that exceeds its fixed `rowHeight` is clipped, never grows the row or spills into
  the row below — unless `autoRowHeight` is set, which is exactly the trade that mode makes:
  rows of differing heights, and no virtualisation, in exchange for text shown in full.
- `autoRowHeight` and virtualisation are never both in effect: with `autoRowHeight` set, `maxHeight`
  scrolls the body but mounts every row. It is the **only** mode in which a row's height is not
  known before it is rendered; every object list is fixed-height and virtualised.
- **There is one presentation, and no screen chooses it.** Every list resolves its columns through
  the same tracks and the same minimums, pans rather than starves a column, draws its cells with the
  same `TableCells` and therefore the same truncation contract, and expands one row at a time —
  because there is nothing else it could be. The nine screens that were migrated onto the retired
  card-per-row variant inherited the column repair by construction, without one of them stating a
  column minimum; converted onto this presentation they inherit it the same way, having no
  presentation left to state (`.../classic-table/REQ-1`, `REQ-22`).
- **The row content is inset like the cells above it, and carries the rule that would have closed
  the row.** It takes the row's own inline inset, so what it holds starts at the same
  x as the cells it belongs to, and the hairline moves from the row to the content: it is what
  separates one row from the next, and drawn between a row's cells and that row's own chips it would
  group them with the row underneath. Holding a **nested**
  list it gives up its block-end padding as well, so the last child row is as flush with what
  follows it as any other row is, and its rule is the group's closing one.
- **A nested list is a child by its indentation, and by nothing else.** With `nested` stated, the
  list is drawn inside the surface of the row that carries it — never on one of its own — and the
  only thing that distinguishes it from the rows around it is an inset stated once in the library:
  **one spacing step past the parent row's cells**, so a child row's box begins 16px inside a parent
  cell's left edge and a child cell 32px inside it, at every viewport. Read on the emitted markup at
  1440×1000, 1280×800 and 375×812: zero surfaces inside the table, one enclosing it; the child row's
  radius, outline and shadow all absent; the parent row and its first child flush (0px), one child
  and the next flush (0px), and the group closed by a **single** full-width hairline — the row
  content's own, the last child giving up its rule so the two are not drawn one above the other.
- **A nested list pans with its parent, in one pan region and under one scrollbar.** It computes no
  horizontal overflow of its own: its columns' minimums reach the parent list's scroller, so at a
  width neither fits, the pair moves together instead of the child sitting still on a scrollbar of
  its own. Measured at 375×812 on a compose project row: the outer table scrolling 775.19 against a
  277px visible box, the nested list reporting no overflow at all and no column of it at zero width.
- **A row, the content it always carries and the panel it expands into are three lines of one
  continuous grid**, wrapped in nothing: the component draws **no surface per row**, and the
  expansion is set apart from the row by the wash it carries rather than by a surface. The row was
  once drawn inside a card of its own, with its content and its expansion, and that carrier was
  deleted with the presentation it belonged to (`.../classic-table/REQ-22`).
- **At most one row is expanded in one list**, by construction: `expandedRowKey` is one key, so a
  list cannot present two open panels. The half of that guarantee spanning *several* lists on one
  screen is `DetailPanel`'s, which closes the panel a previous list left open.
- A row carries no pointer cursor of its own, though it is clickable. One list, one affordance.

## Dependencies

- ScrollArea
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
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-1
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-5
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-6
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-7
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-22
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-35
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-39
