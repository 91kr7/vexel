---
module: ui-library
component: MetricStrip
type: UI component
---

# MetricStrip

**Purpose** → the row of metric columns an object presents its live readings in: tracked columns of
equal width, then a narrower one carrying a pair of readings and no track, and after them any
track-less row read on the metrics' own rhythm.

## Contract

- `<MetricStrip columns readings? stacked? rows? />`
  - `columns` — the tracked columns, in reading order. Each is a `Meter`'s own props plus an `id`
    (`{ id, label?, valueText?, value, max?, reading?, tone?, noSample?, ariaLabel? }`), so a column
    is exactly a `Meter` and the strip invents no second vocabulary for one.
  - `readings` — the trailing untracked column: `{ label, items: { id, label, value }[] }`. Its
    `label` is drawn alone on the first line; the items are drawn on the second, each a muted label
    followed by a prominent value, and the column carries **no bar**.
  - `stacked?: boolean` (default `false`) — lays the metrics **one per row at any width** instead of
    side by side, for a strip inside a box too narrow to carry its columns as a row: a card standing
    in a grid rather than across the page. Every column keeps its label, its value, its capacity
    note and its track — it is the arrangement that changes, never the content. A strip that does
    not ask for it renders exactly what it rendered before the prop existed.
  - `rows?: { id, label, content }[]` — track-less rows drawn **after** the metrics, on the metrics'
    own rhythm: the label at the left in the strip's small uppercase muted treatment, anchoring the
    row, and `content` right-aligned against the strip's right edge, wrapping there rather than
    widening it. `content` is already-built elements the strip never reads — a set of chips, a
    count — which is what keeps a fact read like a metric and measured like nothing inside the
    strip's alignment instead of composed beside it. A strip given no rows renders exactly what it
    rendered before the prop existed.

Description:
- Every tracked column has the same width, whatever it holds; the trailing readings column is
  narrower than one of them. The whole strip spans its container's inner width.
- **Stacked, the readings column is one line**: its label at the left and its readings at the right,
  which is the rhythm every other row of a stacked strip reads in — and the same rhythm a `rows`
  entry takes. Side by side it keeps its two lines, the readings sitting on the tracks' own line
  beside it, because there it has a track to be level with (2026-08-25).
- The second line of every column starts at the same y, so the readings sit on the same line as the
  tracks beside them however tall each column's first line would otherwise have been.
- Below the phone breakpoint (720px) the strip stacks whether or not it was asked to: one full-width
  column per metric, each keeping its label, its value, its reading and its track. Nothing is
  dropped, nothing is summarised, and nothing is scrolled sideways.

## Rules and invariants

- **A column's width is the strip's to decide and never the content's.** Widths are flex proportions
  against a zero basis with the content's automatic minimum waived, so two strips holding different
  values put their columns at the same x. That is the whole reason this is one component rather than
  three columns composed by hand at each call site: composed by hand, the columns drift with the
  content and the values stop lining up down a list. `stacked` does not weaken that: every column
  then spans the strip's full width, so it is still the strip deciding, and two stacked strips of
  the same width still place their metrics at the same x.
- **The stacked shape is one shape, not two.** `stacked` and the phone breakpoint produce the same
  arrangement from the same declarations; asking for it above the breakpoint and falling into it
  below cannot diverge.
- **A row's label is what anchors it**, so a row holding one item and a row holding four keep the
  same shape and the same left edge — which is the property that makes a `rows` entry readable
  beside the metrics rather than as a loose group of content under them.
- Domain-agnostic: it receives already-formatted strings and plain numbers, and knows nothing about
  what is being measured.
- Nothing is animated or transitioned: a value that changes is redrawn where it stood.
- It declares no typography of its own — the labels and values are the metric primitives' single
  declarations of those treatments, shared by selector.

## Dependencies

- Meter

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-6
- plan-docker_management_app-containers_card_view/REQ-7
- plan-docker_management_app-containers_card_view/REQ-8
- plan-docker_management_app-containers_card_view/REQ-10
- plan-docker_management_app-containers_card_view/REQ-17
- plan-docker_management_app-containers_card_view/REQ-30
- plan-docker_management_app-containers_card_view/REQ-31
- plan-docker_management_app-containers_card_view/REQ-33
- plan-docker_management_app-containers_card_view/REQ-34
- plan-docker_management_app-containers_card_view/REQ-5
- plan-docker_management_app-containers_card_view/REQ-12
