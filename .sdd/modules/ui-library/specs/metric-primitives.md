---
module: ui-library
component: Metric primitives (MetricTile, Meter, Sparkline)
type: UI component
---

# Metric primitives

**Purpose** → the three domain-agnostic pieces every resource-usage reading is built from: a tile
carrying one metric, a proportional bar for a used/limit pair, and a compact line over a bounded
window of recent samples.

## Contract

- `MetricTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'`
- `<MetricTile label value subLabel? tone? surface? onActivate? ariaLabel? children? />`
  - `label` — the metric's name, shown small and muted above the value.
  - `value` — the reading, shown prominently in monospace; `tone` colors it (`neutral` by default,
    i.e. the primary text color).
  - `subLabel` — optional second line under the value (e.g. what the value is relative to).
  - `children` — optional slot under the sub-label, for a `Meter`, a `Sparkline` or both.
  - `surface` (default `false`) — draws the reading on its own glass panel, for a tile standing
    alone rather than inside a panel that already provides one.
  - `onActivate?()` — makes the whole tile a single activatable control: a pointer click and a
    keyboard activation (it is reachable by Tab, and Enter/Space activate it) both call it once.
    Without it the tile is inert text and takes no focus.
  - `ariaLabel` — the activatable tile's accessible name, for when "4" and "Running" do not say
    where activating leads; ignored when `onActivate` is absent.
- `<Meter label? value max? reading? tone? ariaLabel? />`
  - draws a bar filled for `value / max`, clamped to the `0…1` range.
  - `max` missing or not positive → the bar stays empty (no limit is known); `value` negative or
    not finite → treated as `0`.
  - `label` (left) and `reading` (right, e.g. `"128MB / 512MB"`) form the line above the bar; with
    neither, only the bar is rendered.
  - exposes its filled percentage to assistive technology as a meter with an accessible name from
    `ariaLabel`, falling back to `label`.
- `<Sparkline values max? tone? height? ariaLabel? emptyLabel? />`
  - `values` — the sample window, oldest first; the caller owns the window's size.
  - draws one line (with a tinted area beneath it) spanning the full width, the horizontal step
    being the window's length and the vertical scale being `max`, defaulting to the largest value
    in the window; values outside `0…max` are clamped.
  - fewer than two values → `emptyLabel` (default `"No samples yet"`) is shown instead of a line,
    in the same vertical space.
  - `height` — rendered height in px, default `32`.

## Rules and invariants

- All three are domain-agnostic: they receive already-formatted strings and plain numbers, and know
  nothing about what is being measured.
- The sparkline is redrawn only when its `values` (or scale) change: it runs no animation loop, no
  timer, and no transition — a live metric costs one repaint per sample.
- Every color, radius and spacing comes from a design token; the tones map to the accent, success,
  warning, danger and muted roles.

## Dependencies

- Surface (only when `surface` is set)

## Requirements served

- plan-docker_management_app/REQ-32
- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-18
