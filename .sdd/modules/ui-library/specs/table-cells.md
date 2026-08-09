---
module: ui-library
component: StatusDotCell, TwoLineCell, MetaCell, IdentifierCell, BadgeListCell, ProportionBarCell
type: UI component
---

# Table cells

**Purpose** → the reusable cell contents composed inside a `DataTable` column's `render`: a colored
status dot, a title-over-subtitle pair, a muted monospace value, a truncated identifier, a list of
badges with an overflow indicator, and a magnitude bar sized relative to the column's largest row.

## Contract

- `<StatusDotCell tone label? />` — `tone`: `'success' | 'neutral' | 'warning' | 'danger'`; renders a
  colored dot, followed by `label` when given.
- `<TwoLineCell title? subtitle? action? wrap? />` — `title` on its own line, `subtitle` (e.g. short
  id · state) in muted monospace underneath, and an optional trailing `action` (e.g. an edit
  affordance) hidden until the cell is hovered or a descendant gains keyboard focus — never
  `display: none`, so it stays reachable via Tab and to assistive technology regardless of hover
  state. `title` may be omitted, for a cell carrying the secondary line alone (a sentence sitting
  under another cell's value); the primary line is then absent, not blank.
  `wrap: true` — both lines wrap and are shown in full instead of ellipsis-truncating, and the
  subtitle drops the monospace treatment (reserved for machine values) since a wrapping secondary
  line is a sentence. For a content-sized row only (`DataTable autoRowHeight`): in a fixed-height
  row the extra lines would be clipped.
- `<MetaCell children? wrap? title? unavailableReason? />` — muted monospace text for a
  numeric/meta value (CPU, memory, ports, uptime, …); renders `'–'` when `children` is empty —
  `undefined`, `null` and the empty string are all empty, and read identically. Single
  line by default: overflowing text ellipsis-truncates instead of wrapping or growing the row, with
  the full value available as a native tooltip (`title`, defaulting to the text content itself when
  `children` is a string or number). `wrap: true` instead wraps long unbroken values (e.g. a
  PATH-style line) onto multiple lines within the cell. When `children` is empty and
  `unavailableReason` is given, renders `'unavailable'` instead of `'–'`, with the reason as a
  tooltip — for a value the source genuinely cannot provide, as opposed to one merely absent.
- `<IdentifierCell value? maxChars? />` — an opaque identifier (hash, digest, key) in monospace.
  Renders `'–'` when `value` is empty. When `maxChars` is given and the value is longer, the value is
  cut at its tail and the cut is marked with an ellipsis character, so every row shows the same
  number of characters regardless of the column width; whatever survives that cut still
  ellipsis-truncates to one line if the column is narrower. The full, uncut value is always available
  as a native tooltip.
- `<BadgeListCell labels tone? maxVisible? emptyLabel? emptyTone? />` — `labels: string[]` rendered
  as one `Badge` each, in order, on a single line.
  - at most `maxVisible` badges are rendered (default 3); when there are more, a trailing `+N` badge
    reports how many are hidden and lists them in its tooltip
  - `tone` applies to the label badges (default `neutral`); the `+N` badge is always `neutral`
  - empty `labels` → `emptyLabel` rendered as a single badge with `emptyTone` (default `neutral`)
    when given, otherwise `'–'`
- `<ProportionBarCell fraction label tone? />` — a rounded bar filled to `fraction` (`0..1`, clamped;
  non-finite treated as `0`) of the cell's width, carrying `label` inside it.
  - `tone`: `BadgeTone` (default `'neutral'`), colors the fill the same way `Badge` colors a tag.
  - the fill never shrinks below a small minimum width, so a near-zero row's bar stays visible and
    legible even at `fraction` `0`.
  - `label`, when a string, is also the fill's tooltip (shown when the label itself is truncated).

## Rules and invariants

- Every cell stays on one line and never grows the row's fixed height: content that does not fit is
  truncated or clipped, never wrapped. The two opt-in exceptions — `MetaCell wrap` and
  `TwoLineCell wrap` — are for a table that has given up fixed row heights (`DataTable
  autoRowHeight`), and are the only way text reads in full inside a cell.
- A cell with nothing to show is never blank: it carries the dash (or `'unavailable'`), whichever
  way its caller expressed the absence. A blank cell would read as a rendering fault rather than as
  a value the source does not have.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-105
