---
module: ui-library
component: DashboardLayout
type: UI component
---

# DashboardLayout

**Purpose** → the arrangement an overview screen is built on: a row of equal summary tiles above a
two-column panel grid, with an optional full-width panel underneath.

## Contract

Description:

- three stacked regions, in this order: the tiles row, the two-column panel area, the optional
  full-width footer panel.

```markdown
<DashboardLayout tiles primary secondary footer? />
```

- `tiles` — rendered as one row of equal-width cells; the caller supplies the tiles themselves.
- `primary` — the wider of the two columns.
- `secondary` — the narrower column, beside `primary`.
- `footer` — optional panel spanning the full width below both columns; omitted entirely when not
  given (no empty region is left behind).

Shows:

- the tiles side by side at equal width, in the order given.
- `primary` and `secondary` side by side, `primary` first and wider, **ending at the same y**: both
  are given the height of the taller one, so the row has one straight bottom edge.
- `footer`, when given, across the full width under them.

## Rules and invariants

- The tiles keep equal widths and reflow onto a further line rather than shrinking below a width
  where a reading no longer fits on one line; the caller does not say how many fit per line.
- **The two columns of the panel row share a bottom edge**, whichever of them holds more: the panel
  the caller passes fills the cell it is given rather than stopping at its content, so neither a
  longer list nor an extra row on one side leaves the other short. The caller states no height for
  either panel, at any viewport — the arrangement is this component's answer, not the screen's
  (`plan-ui-coherence-optimisation/REQ-28`).
- **A panel is sized by its cell, and never the other way round.** Filling the cell is a guarantee
  about height alone: a panel holding content wider than its column — a list at the phone
  breakpoint — still takes the width the cell gives it and pans or truncates inside itself. The two
  halves are one rule, and they were once shipped apart: making a panel fill its cell let the
  panel's own content size the cell instead, and the container-activity card measured **542px
  against a 335px content column at 375×812**, its list region 500px where it should pan at 293px.
- Below the tablet breakpoint the two columns become one, `primary` first and `secondary` under it;
  stacked, each is its own height and the shared edge no longer applies.
- Each region is a plain container: it applies no padding, background or border of its own, so the
  panels the caller passes are what is seen.
- No cell can be squeezed by an unbreakable long value in a sibling: a wide value scrolls or
  truncates inside its own cell instead of stealing width from the others.
- Domain-agnostic: it knows nothing of what the tiles or panels contain.
- Every gap comes from a design token.

## Requirements served

- plan-docker_management_app/REQ-14
- plan-ui-coherence-optimisation/REQ-66
