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

- `items: UsageBreakdownItem[]` — `{ id, label, value, valueLabel, onActivate?, ariaLabel? }`, drawn
  in the order given.
  - `value` — the category's magnitude, used only to compute the bar's length; negative or
    non-finite is treated as `0`.
  - `valueLabel` — the absolute reading, already formatted by the caller, shown opposite the label.
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
- `total` of `0` (or a sum of `0`) → every bar is empty; the labels and readings still show.
- each row's bar takes the next color of the library's four-color categorical palette, by position
  in the list, repeating past the fourth.
- each bar exposes its filled percentage to assistive technology as a meter named after its label.

## Rules and invariants

- The colors are categorical, not semantic: the fourth row is not "worse" than the first, it is only
  the fourth category. That is why this is not a stack of `Meter`s, whose color carries a health
  meaning, and why an item cannot pick its own color — position in the list decides it, so two
  breakdowns of the same list always agree.
- The component formats nothing: it renders `valueLabel` as given and never turns `value` into text.
- Domain-agnostic: it knows nothing of what is being broken down.
- Every color, radius and spacing comes from a design token.

## Requirements served

- plan-docker_management_app/REQ-16
- plan-docker_management_app/REQ-18
