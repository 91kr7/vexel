---
module: ui-library
component: DefinitionList
type: UI component
---

# DefinitionList

**Purpose** → label → value bands for a detail surface (e.g. a container's identity, restart policy,
environment variables), each with an optional copy affordance, arranged in as many columns as the
list's own width can carry.

## Contract

- `<DefinitionList items contentClass? columns? />`
  - `items: { label, value: ReactNode, copyValue?: string }[]`.
  - `contentClass?: 'short-scalar' | 'long-single-line' | 'free-text'` — default `'short-scalar'`.
    What the section holds; the minimum band width follows from it (`content-columns.md`). **This is
    the only thing a caller states about the layout**: no count, no track template, no length.
  - `columns?: 1 | 2` — **a known defect, deliberately left standing.** A caller cannot know the width
    it will be given, so a caller-stated count is the wrong shape; it is retired, together with its
    `--columns-2` rule, by the work that moves the five surfaces still passing it onto the derived
    arrangement. While it is passed, it overrides the derived arrangement entirely and the section
    renders exactly as it did before that arrangement existed. **No new call site may use it.**
  - When `copyValue` is set on an item, its band renders a `CopyButton` for that exact text next to
    `value`, in that position, in the tab order it already had.

Shows:
- One band per item, in the declared order, filling left to right then down.
- As many bands per line as the list's own measured width carries at its content class's minimum
  (`ContentColumns`); the count rises with the width and never falls as it widens.

## Rules and invariants

- **The band is the grid item, and it holds both spans.** Label and value are never placed in tracks
  of their own: a `display: contents` or subgrid arrangement over the two spans reads column-first to
  assistive technology and comes apart the moment one value wraps. The accessible reading order is the
  declared order.
- **The label→value run is bounded, the band is not.** The band fills its track — its wash reaches the
  section's edge, so no dead margin re-appears on the right — while the run from the label's left edge
  to the value's right edge stops at the content class's maximum (~500px short scalar, ~700px long
  single-line) and any surplus sits at the band's **trailing edge**, outside the run. There is no band
  in which a label and its value sit at opposite ends of a wide surface.
- **Bands on one line share a height**: a wrapped two-line value does not leave its neighbours as short
  pills against a tall one.
- **A value longer than its band wraps inside it**, gaining no ellipsis, no tooltip-only presentation
  and no hidden overflow. A label wraps only when it alone is wider than its band, and is never shrunk
  to make room for a value.
- Band padding, type, colour, the wash and the 37px band step are the delivered ones: this component
  moves space, it does not restyle and it does not buy density out of the type.
- The row gap is `--space-1` (the delivered band step), the column gap `--space-6`; both are tokens.

## Dependencies

- CopyButton
- ContentColumns (`contentColumnsClassName`, form `pair`)

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-26
- plan-docker_management_app-detail_property_columns/REQ-1
- plan-docker_management_app-detail_property_columns/REQ-2
- plan-docker_management_app-detail_property_columns/REQ-6
- plan-docker_management_app-detail_property_columns/REQ-8
- plan-docker_management_app-detail_property_columns/REQ-9
- plan-docker_management_app-detail_property_columns/REQ-10
- plan-docker_management_app-detail_property_columns/REQ-11
- plan-docker_management_app-detail_property_columns/REQ-14
- plan-docker_management_app-detail_property_columns/REQ-30
- plan-docker_management_app-detail_property_columns/REQ-32
- plan-docker_management_app-detail_property_columns/REQ-34
