---
module: ui-library
component: UsageBreakdown
type: UI component
---

# UsageBreakdown

**Purpose** → shows how one whole is split across named categories: one row per category with its
label, its absolute reading and a bar as long as its share of the whole.

## Contract

```markdown
<UsageBreakdown items total? emptyState? />
```

- `items: UsageBreakdownItem[]` — `{ id, label, value, valueLabel, unavailable?, onActivate?,
  ariaLabel? }`, drawn in the order given.
  - `value` — the category's magnitude, used only to compute the bar's length; negative or
    non-finite is treated as `0`.
  - `valueLabel` — the absolute reading, already formatted by the caller, shown opposite the label.
  - `unavailable?` (default `false`) — the category's magnitude **could not be read**; `value` is
    then ignored and the row draws the unmeasured treatment described below.
  - `onActivate?()` — makes that row a single activatable control: a pointer click and a keyboard
    activation (Tab-reachable, Enter/Space) both call it once. A row without it is inert and takes
    no focus.
  - `ariaLabel` — the activatable row's accessible name; ignored when `onActivate` is absent.
- `total?: number` — the full scale every bar is drawn against; defaults to the sum of the items'
  values.
- `emptyState?: ReactNode` — rendered in place of the rows when `items` is empty.

Shows:

- per row: the label, the absolute reading opposite it, and beneath them a bar filled for
  `value / total`, clamped to `0…1`.
- **three distinguishable bar states**, so that a reading of nothing is never the same picture as a
  reading that was never taken:
  - a magnitude above zero → a bar as long as its share, in the row's own color;
  - a magnitude of exactly zero → **a zero-length bar that is still drawn**: its track, plus a mark
    of the row's own color at the track's origin. Not an empty track;
  - `unavailable` → no bar and no mark at all; the track itself is drawn in a distinct, deliberate
    treatment (the same one `Meter` uses where a metric has no measurable maximum), which no
    measured row ever takes.
- `total` of `0` (or a sum of `0`) → every magnitude is zero, so every row shows the zero mark; the
  labels and readings still show.
- a **legend** under the rows: one entry per item, in the same order, each pairing that item's own
  color with its label, so no color the component paints is left unexplained. An `unavailable`
  item's legend entry carries the unmeasured treatment rather than a color, for the same reason.
- each bar exposes its filled percentage to assistive technology as a meter named after its label;
  an `unavailable` row's meter announces `valueLabel` instead of a percentage.

## Rules and invariants

- The colors are categorical, not semantic: the fourth row is not "worse" than the first, it is only
  the fourth category. That is why this is not a stack of `Meter`s, whose color carries a health
  meaning, and why an item cannot pick its own color — position in the list decides it, so two
  breakdowns of the same list always agree.
- **The legend and the rows are one list read twice**: the legend's entries are the items, in their
  order, with their colors, and the component cannot show a color in one and not the other.
- **Zero is a drawn state, not the absence of a drawing** (`plan-ui-coherence-optimisation/REQ-68`).
  A bar of width `0` and a row that could not be measured produce the same picture — nothing on a
  track — and the delivered build showed exactly that, which is why the two are separated here, in
  the component, rather than left to each caller's copy. The caller says which of the two it has;
  the component decides what each looks like.
- The component formats nothing: it renders `valueLabel` as given and never turns `value` into text.
- Domain-agnostic: it knows nothing of what is being broken down. `unavailable` says a reading is
  missing, never why.
- Every color, radius and spacing comes from a design token.

## Requirements served

- plan-docker_management_app/REQ-16
- plan-docker_management_app/REQ-18
- plan-ui-coherence-optimisation/REQ-67
- plan-ui-coherence-optimisation/REQ-68
