---
module: ui-library
component: DefinitionList
type: UI component
---

# DefinitionList

**Purpose** → label → value bands for a detail surface (e.g. a container's identity, restart policy,
environment variables), arranged in as many columns as the list's own width can carry.

## Contract

- `<DefinitionList items contentClass? alignment? />`
  - `items: { label, value: ReactNode }[]`.
  - `contentClass?: 'short-scalar' | 'long-single-line' | 'free-text'` — default `'short-scalar'`.
    What the section holds; the minimum band width follows from it (`content-columns.md`). **This is
    the only thing a caller states about the layout**: no count, no track template, no length.
  - **A caller states no column count, and the type refuses one.** A caller cannot know the width it
    will be given, and a component with both a stated count and a derived one has two answers to the
    same question. The delivered `columns?: 1 | 2` and its `--columns-2` two-track rule are removed,
    not deprecated.
  - `alignment?: 'run' | 'tracks'` — default `'run'`. `run` is the property band's own reading: the
    value follows its label immediately. `tracks` gives each of the two a track of the band, so the
    values of every band of the list begin at one edge and the labels read down as a column of their
    own — for a list scanned by its keys (an environment) rather than read as properties of one
    object. It is an **alignment**, not a second component: everything else about the band — its
    wash, its padding, its run bound, its content class and the derived column count — is the same
    in both.
  - A band renders its label and its value and nothing else. The `copyValue?: string` field, and
    the copy affordance it switched on, were **removed on 2026-08-14** by
    `plan-docker_management_app-remove_copy_controls` — removed from the type, not deprecated and not
    defaulted, so a caller that passes one does not compile.

Shows:
- One band per item, in the declared order, filling left to right then down.
- As many bands per line as the list's own measured width carries at its content class's minimum
  (`ContentColumns`); the count rises with the width and never falls as it widens.

## Rules and invariants

- **The band is the grid item, and it holds both spans**, in either alignment. They are never placed
  in tracks of the *list*: a `display: contents` or subgrid arrangement over the two spans reads
  column-first to assistive technology and comes apart the moment one value wraps. The accessible
  reading order is the declared order, label then its own value, whatever the alignment.
- **`tracks` aligns without measuring anything.** Every band on a line of the content-columns grid is
  the same width, so one track length inside the band gives every value on that line the same
  starting edge — no `ResizeObserver`, no per-frame computation, and no shared grid over the list.
  The label track is one token length (`--band-label-track`), capped at a share of the band so a
  narrow band never gives the label more room than the value it labels; a label longer than the track
  **wraps inside it** and is neither shrunk nor truncated, exactly as in `run`. Its label is set in
  the value's monospace — in this alignment it is a key of the data, not the name of a property, and
  that is what lets the column of keys be scanned character by character — while its size and its
  colour stay the label's own. A label track sized
  to the widest label of the list is deliberately not what this does: that needs one grid over every
  band, which costs the band its own element and the list its derived column count.
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

  > **A list row truncates, a property band wraps** — the boundary of the library's truncation
  > contract (`truncation-contract.md`), stated here because this is the side a later reader gets
  > wrong. That contract exists because a flexible text laid beside trailing metadata in a **row**
  > overlaps it, and the answer there is an explicit floor plus an ellipsis. A band is not that
  > shape and takes none of its classes: it has no trailing metadata to collide with, and its values
  > are the ones an operator most needs to read exactly — a digest, a mount path, an environment
  > line. Clamping one to a line here would not repair a layout defect, it would create a data loss.
  > **What is legitimate here is the band getting wider or the section getting fewer columns; what
  > is never legitimate is the value getting shorter.** The route out of a truncation elsewhere is
  > this component: where a list row truncates an identifier, the object's detail surface shows the
  > same value here, wrapped and selectable.
- **Every value reads from the leading edge**, whatever it holds and however many lines it takes.
  The component declares no text alignment of its own, so a wrapped value's lines start where its
  first line starts. Until this rule existed the value box declared `text-align: right`, inert for a
  value that fits on one line and live for one that wraps — which is how the network `Options` value
  came to be the one right-aligned value in the product.
- Band padding, type, colour, the wash and the 37px band step are the delivered ones: this component
  moves space, it does not restyle and it does not buy density out of the type.
- The row gap is `--space-1` (the delivered band step), the column gap `--space-6`; both are tokens.
- **The value box lays its own children out with a `--space-1` gap of its own** — distinct from the
  row gap above, which separates bands. `value` is a `ReactNode`, so a value is not necessarily one
  node, and the gap is what keeps several of them apart inside the band.

  > **Its original occasion is gone, and the rule stands anyway.** Until 2026-08-14 the second node
  > was the copy affordance, and this gap was what separated the value from it; that affordance was
  > removed by `plan-docker_management_app-remove_copy_controls`, leaving the rule with no caller at
  > all — until the container detail's `Mounts` section, whose value is a destination and a `ro`/`rw`
  > `Chip`, became the first to exercise it again on 2026-08-26. Recorded here because from the state
  > in between the rule read as an orphan and the instinct was to delete it. **It was not one.** The
  > element still renders, and
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
- plan-ui-coherence-optimisation/REQ-20
- plan-ui-coherence-optimisation/REQ-21
- plan-ui-coherence-optimisation/REQ-34
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-18
