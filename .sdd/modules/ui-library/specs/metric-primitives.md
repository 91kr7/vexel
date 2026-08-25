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
- `<Meter label? valueText? value max? reading? tone? ariaLabel? noSample? />`
  - draws a bar filled for `value / max`, clamped to the `0…1` range.
  - `valueText` — the reading shown **beside the label**, prominently, so a column reads
    `CPU 0.4%` … `of 8 cores` in three treatments rather than as one string. Its presence is what
    gives `label` the small uppercase muted treatment; without it the label keeps the plain one it
    always had, and the meter renders exactly as it did before this prop existed.
  - `noSample` → **nothing was measured**: `valueText` is replaced by `—`, `reading` by the words
    `no sample`, and the track is drawn **empty and fainter**, with no fill at all. It is a third
    state, distinct from both of its neighbours: an unlimited container (no measurable maximum)
    is measured and must not be shown as unmeasured, and a **measured zero** keeps its number and
    its reading. The meter announces the same words as its `aria-valuetext`.
  - a **non-zero** measurement always draws a visible fill, never a sub-pixel sliver that would read
    as an empty track. A measured zero draws none.
  - `max` missing or not positive → **the metric has no measurable maximum**, and the bar says so:
    the track is drawn in a distinct, deliberate treatment instead of as an empty one, so it does not
    read as a bar whose fill failed to render. It occupies the same box as a filled bar, to the pixel,
    so a reading with a ceiling and a reading without one are the same height.
  - `value` negative or not finite → treated as `0`.
  - `label` (left) and `reading` (right, e.g. `"128MB / 512MB"`) form the line above the bar; with
    neither, only the bar is rendered.
  - exposes its filled percentage to assistive technology as a meter with an accessible name from
    `ariaLabel`, falling back to `label`; with no measurable maximum the percentage stays `0` and the
    meter additionally announces that there is no maximum to be a percentage of.
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
- The three states of a track are told apart on sight and in words: measured (a fill, its number and
  its reading), no measurable maximum (the deliberate unbounded treatment), and no sample (empty and
  faint, `—`, `no sample`). None of them is drawn like another.
- The small uppercase muted label treatment is declared **once** for these primitives and shared by
  the tile's label, the meter's eyebrow label and the metric strip's readings label; the prominent
  monospace value likewise. A second declaration of either is the defect.
- A bar is never merely absent where a limit is unknown. The empty track was the delivered answer and
  it is indistinguishable from a broken one (`plan-ui-coherence-optimisation/REQ-64`), so "no ceiling"
  is a **drawn state** of the component rather than the caller's problem: a caller with no maximum to
  give still asks for a `Meter`, and gets the state that says so.

## Dependencies

- Surface (only when `surface` is set)

## Requirements served

- plan-docker_management_app/REQ-32
- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-18
- plan-ui-coherence-optimisation/REQ-64
- plan-docker_management_app-containers_card_view/REQ-7
- plan-docker_management_app-containers_card_view/REQ-13
- plan-docker_management_app-containers_card_view/REQ-16
- plan-docker_management_app-containers_card_view/REQ-17
- plan-docker_management_app-containers_card_view/REQ-30
