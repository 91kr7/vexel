---
module: ui-library
component: DefinitionList
type: UI component
---

# DefinitionList

**Purpose** → label → value bands for a detail surface (e.g. a container's identity, restart policy,
environment variables), arranged in as many columns as the list's own width can carry.

## Contract

- `<DefinitionList items contentClass? />`
  - `items: { label, value: ReactNode }[]`.
  - `contentClass?: 'short-scalar' | 'long-single-line' | 'free-text'` — default `'short-scalar'`.
    What the section holds; the minimum band width follows from it (`content-columns.md`). **This is
    the only thing a caller states about the layout**: no count, no track template, no length.
  - **A caller states no column count, and the type refuses one.** A caller cannot know the width it
    will be given, and a component with both a stated count and a derived one has two answers to the
    same question. The delivered `columns?: 1 | 2` and its `--columns-2` two-track rule are removed,
    not deprecated.
  - A band renders its label and its value and nothing else. The `copyValue?: string` field, and
    the copy affordance it switched on, were **removed on 2026-08-14** by
    `plan-docker_management_app-remove_copy_controls` — removed from the type, not deprecated and not
    defaulted, so a caller that passes one does not compile.

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
- **The value box lays its own children out with a `--space-1` gap of its own** — distinct from the
  row gap above, which separates bands. `value` is a `ReactNode`, so a value is not necessarily one
  node, and the gap is what keeps several of them apart inside the band.

  > **Its original occasion is gone, and the rule stands anyway.** Until 2026-08-14 the second node
  > was the copy affordance, and this gap was what separated the value from it; that affordance was
  > removed by `plan-docker_management_app-remove_copy_controls`, and no caller in `client/src`
  > passes a multi-node value today. Recorded here because from that state the rule reads as an
  > orphan and the instinct is to delete it. **It is not an orphan.** The element still renders, and
  > the rule serves the **type**, not the current callers: `value: ReactNode` admits several nodes,
  > so a value composed of a text node and a `Badge`, or of two `Chip`s, is a thing this component
  > contracts to lay out today. REQ-10's orphan rule is about a component, an export or a style rule
  > with **no element** — not about a rule whose callers all happen to pass one node this week.
  > Deleting it would withdraw a capability of the public API on the grounds that nobody exercises
  > it, which is a different decision from the one that report asked for, and one nobody asked for.
  > **What would have to be true for it to go**: `value` narrowing in the type from `ReactNode` to a
  > single node — at which point the gap has nothing left to separate and goes with that change,
  > deliberately and on its own reasoning.

## Dependencies

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
- plan-docker_management_app-detail_property_columns/REQ-25
- plan-docker_management_app-detail_property_columns/REQ-26
- plan-docker_management_app-detail_property_columns/REQ-32
- plan-docker_management_app-detail_property_columns/REQ-34
