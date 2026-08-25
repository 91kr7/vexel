---
module: ui-library
component: MetricStrip
type: UI component
---

# MetricStrip

**Purpose** → the row of metric columns an object presents its live readings in: tracked columns of
equal width, then a narrower one carrying a pair of readings and no track.

## Contract

- `<MetricStrip columns readings? />`
  - `columns` — the tracked columns, in reading order. Each is a `Meter`'s own props plus an `id`
    (`{ id, label?, valueText?, value, max?, reading?, tone?, noSample?, ariaLabel? }`), so a column
    is exactly a `Meter` and the strip invents no second vocabulary for one.
  - `readings` — the trailing untracked column: `{ label, items: { id, label, value }[] }`. Its
    `label` is drawn alone on the first line; the items are drawn on the second, each a muted label
    followed by a prominent value, and the column carries **no bar**.

Description:
- Every tracked column has the same width, whatever it holds; the trailing readings column is
  narrower than one of them. The whole strip spans its container's inner width.
- The second line of every column starts at the same y, so the readings sit on the same line as the
  tracks beside them however tall each column's first line would otherwise have been.
- Below the phone breakpoint (720px) the strip stacks: one full-width column per metric, each
  keeping its label, its value, its reading and its track. Nothing is dropped, nothing is
  summarised, and nothing is scrolled sideways.

## Rules and invariants

- **A column's width is the strip's to decide and never the content's.** Widths are flex proportions
  against a zero basis with the content's automatic minimum waived, so two strips holding different
  values put their columns at the same x. That is the whole reason this is one component rather than
  three columns composed by hand at each call site: composed by hand, the columns drift with the
  content and the values stop lining up down a list.
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
