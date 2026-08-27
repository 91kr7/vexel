---
module: ui-library
component: DefinitionList
type: UI component
---

# DefinitionList

**Purpose** → label → value bands for a detail surface (e.g. a container's identity, restart policy,
environment variables), arranged in as many columns as the list's own width can carry.

## Contract

- `<DefinitionList items contentClass? arrangement? />`
  - `items: { label, value: ReactNode, tone?: 'danger' }[]`.
  - `tone?: 'danger'` on an item — **the one distinguished reading a value has, and it is a
    severity**: this value is bad news (a non-zero exit code). A value without one is drawn like every
    other. It is not the table cell's `attention`, which says "notable" and says nothing about whether
    the reading is good or bad; a caller that wants "look at this one" is asking for that instead.
  - `contentClass?: 'short-scalar' | 'long-single-line' | 'free-text'` — default `'short-scalar'`.
    What the section holds; the minimum band width follows from it (`content-columns.md`).
  - **A caller states what its values are and which named arrangement it asks for, and nothing else
    about the layout**: no count, no track template, no length
    (`plan-docker_management_app-detail_property_columns/REQ-27`). A named arrangement is none of
    those three — it is a shape the library owns end to end, exactly as `Grid`'s is — and the caller
    still cannot know, or state, the width it will be given.
  - **A caller states no column count, and the type refuses one.** A caller cannot know the width it
    will be given, and a component with both a stated count and a derived one has two answers to the
    same question. The delivered `columns?: 1 | 2` and its `--columns-2` two-track rule are removed,
    not deprecated.
  - `arrangement?: 'run' | 'key-columns'` — default `'run'`. `run` is the property band's own
    reading: the value follows its label immediately. `key-columns` gives label and value a share
    each of every band, so the values of the list all begin at one edge and the labels read down as a
    column of their own — for a list scanned by its keys rather than read as properties of one
    object. It is an **arrangement of the band**, not a second component:
    everything else — the wash, the padding, the run bound, the content class and the derived column
    count — is the same in both.
  - A band renders its label and its value and nothing else. The `copyValue?: string` field, and
    the copy affordance it switched on, were **removed on 2026-08-14** by
    `plan-docker_management_app-remove_copy_controls` — removed from the type, not deprecated and not
    defaulted, so a caller that passes one does not compile.

Shows:
- One band per item, in the declared order, filling left to right then down.
- As many bands per line as the list's own measured width carries at its content class's minimum
  (`ContentColumns`); the count rises with the width and never falls as it widens.

## Rules and invariants

- **The band is the grid item, and it holds both spans**, in either arrangement. They are never placed
  in tracks of the *list*: a `display: contents` or subgrid arrangement over the two spans reads
  column-first to assistive technology and comes apart the moment one value wraps. The accessible
  reading order is the declared order, label then its own value, whatever the arrangement.
- **`key-columns` aligns without measuring anything, and without stating a track template.** The band
  stays the flex row it is in either arrangement; what changes is that its label takes one stated
  share of it and neither grows nor shrinks. Every band on a line of the content-columns grid is the
  same width, so that one share puts every value on the line at the same starting edge — no
  `ResizeObserver`, no per-frame computation, no shared grid over the list, and nothing said about
  the list's own tracks, which stay the shared arrangement's (`content-columns.md`). The share is one
  token length (`--band-label-track`) capped at a share of the band, so a narrow band never gives the
  key more room than the value it belongs to; a key longer than the share **wraps inside it** and is
  neither shrunk nor truncated, exactly as in `run`. The `run` bound above applies here too and never
  reaches: the share is the smaller of the two at every band width the product draws. Its label is set in the value's monospace — here it is a key of
  the data, not the name of a property, and that is what lets the column of keys be scanned character
  by character — while its size and its colour stay the label's own. A label share sized to the
  widest label of the list is deliberately not what this does: that needs one grid over every band,
  which costs the band its own element and the list its derived column count.

  > **Where it stops being the right shape, and what to ask for instead.** The share is one track for
  > every band of the list, so a short key leaves its value beginning a third of the way into an
  > otherwise empty band, and a value that needs the whole row is wrapped inside the track while the
  > room stands empty beside it — both measured on the container's `Config` tab on 2026-08-27, a
  > 29px key in the 180px track and a volume source over four lines with 942px free beside it. A
  > collection whose entries each want the room they hold, or whose parts want naming, asks for
  > `FieldList` (`field-list.md`), where every part is a field of its own. `key-columns` stays what
  > it was written for: a column of keys scanned down, in bands narrow enough that one track and one
  > offset are what the eye wants.
- **The label→value run is bounded, the band is not.** The band fills its track — its wash reaches the
  section's edge, so no dead margin re-appears on the right — while the run from the label's left edge
  to the value's right edge stops at the content class's maximum (~500px short scalar, ~700px long
  single-line) and any surplus sits at the band's **trailing edge**, outside the run. There is no band
  in which a label and its value sit at opposite ends of a wide surface.
- **Bands on one line share a height**: a wrapped two-line value does not leave its neighbours as short
  pills against a tall one.
- **A value longer than its band wraps inside it**, gaining no ellipsis, no tooltip-only presentation
  and no hidden overflow. A label wraps only when it does not fit the bound below — never because of
  what its value happens to hold — and is never shrunk, shortened, ellipsised or hidden.
- **The value takes the shortage first, down to its floor; only then does the label give way.** That
  ordering is the rule, and it is stated as a **bound on the label computed from the value's floor** —
  the label is laid out at its own width, up to what the band has left once `--band-value-min` (~13
  characters of the value's monospace) is reserved. So a band that can hold both draws the label at
  its full ink and never touches it, whatever its value is doing: `Tags`, 27px of label in a 395px
  band, is one line while its value wraps over four. A band that cannot hold both wraps the value
  first, and takes what is still missing out of the label — 159px of the 271px band at a phone width,
  for a 49-character mount source — and never out of the value's box.

  > **Neither a share of the band nor a shrink factor can express that, and both were tried.** The
  > label used not to give way at all (`flex: none`, bounded only by the whole band), and at 375px a
  > mount's source past ~17 characters took all 271px of one: the value was laid out as a box of
  > **0px beyond the band's own right edge**, the `ro` chip inside it painted off the side of a
  > viewport that could not be scrolled to it. Capping the label at **half the band** closed that and
  > broke the other case in the same stroke — the About screen's `Oldest Engine API the daemon
  > accepts`, 199px of label in a band offering 375px, wrapped by a 187.5px cap on a band that was
  > never in trouble (`plan-docker_management_app-detail_property_columns/REQ-26`) — because a
  > constant fraction is evaluated on every band at every width. Making the label **shrinkable**
  > (`flex: 0 1 auto`) failed a third way: flexbox splits a shortage in proportion to shrink × base
  > size, so it never asks where the value is, and the image panel's `Tags` — 26.7px of ink in a
  > 418.8px band whose value sat 270px above its own floor — was drawn 12.5px wide over four lines,
  > one character per line. That is this component's oldest rule breaking (*proportional shrinking
  > would break `Created` at five characters to make room for a long value*), and it is why the label
  > does not shrink at all. **The bound has to be conditional on the value's floor and on nothing
  > else.**

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
- **A toned value differs by colour and by nothing else.** The band keeps its type, its size, its
  alignment and its wash, so a section holding one still scans as one section, and the colour is the
  product's own danger role named from the tokens — never a colour written here. Nothing else about
  the band is conditional on it: a toned value wraps, is bounded and is selected exactly as an
  untoned one is.
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
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-36
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-40
