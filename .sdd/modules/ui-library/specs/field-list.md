---
module: ui-library
component: FieldList
type: UI component
---

# FieldList

**Purpose** → a collection read as the fields of a form: one entry per row where its content class
asks for one, the entry's parts side by side, each in a field of its own (e.g. a container's
environment variables, its port mappings, its mounts). It is the reading counterpart of the row
editors — `KeyValueEditor` and `RepeatableRowList` — and repeats their geometry with the controls
replaced by their values.

## Contract

- `<FieldList items contentClass? arrangement? />`
  - `items: { fields: { caption?: string, value: ReactNode }[] }[]` — one entry per element, one
    field per part of it, both in the declared order.
  - `caption?` names what a field holds and is drawn above its value, in the library's one label
    treatment (the same small, quiet label `FormField` gives a control). Omitted where the value
    names itself.
  - `contentClass?: 'short-scalar' | 'long-single-line' | 'free-text'` — default `'short-scalar'`.
    What the entries hold; the minimum entry width follows from it (`content-columns.md`, form
    `value`), and from that the number of entries per line. `'free-text'` is one entry per row at
    the list's full width.
  - `arrangement?: 'even' | 'content'` — default `'even'`. How an entry shares its width among its
    own fields. `even`: an equal share each, so the same field of every entry begins at the same
    edge and the list reads as columns. `content`: the fields share the entry in proportion to what
    they hold, so a part that needs most of the row takes it from the sibling that does not — up to
    half of it, and no further (see the cap below).
  - **A caller states what its entries hold and which named arrangement it asks for, and nothing
    else about the layout**: no count, no track template, no length, no share
    (`plan-docker_management_app-detail_property_columns/REQ-27`). It cannot know the width it will
    be given.

Shows:
- One entry per item, in the declared order, filling left to right then down; inside an entry, one
  field per part, side by side in the declared order.
- As many entries per line as the list's own measured width carries at its content class's minimum
  (`ContentColumns`, form `value`); the count follows the **list's own box** and never the
  viewport's.

## Rules and invariants

- **The entry is the grid item and holds every field of it.** The fields are never placed in tracks
  of the *list*: a `display: contents` or subgrid arrangement over them reads column-first to
  assistive technology and comes apart the moment one value wraps. The accessible reading order is
  the declared order — caption then its own value, field after field, entry after entry.
- **A value begins where its own field begins.** Each field is a box of its own — the property
  band's delivered wash, radius and padding, moved from the entry onto each of its parts — so the
  room a short value leaves unused reads as its field and not as a hole in front of the next value.
  That is the difference from `DefinitionList arrangement="key-columns"`, whose label takes one
  fixed track of every band and starts every value at that one offset: a key of 29px of ink in a
  180px track leaves its value beginning a third of the way into an otherwise empty band.
- **`even` aligns without measuring anything and without stating a track template.** Every field
  takes one equal share of the entry, from a zero basis; every entry on a line of the
  content-columns grid is the same width, so the second field of every entry begins at the same
  edge — no `ResizeObserver`, no per-frame computation, no shared grid over the list. This is the
  edit form's own geometry, where the two text fields of one row take a half each.
- **`content` gives a long part the room a short sibling does not need.** The basis is what each
  field holds and only the surplus is split evenly, so a volume source is drawn on one line while
  its destination keeps what it needs. Below the entry's width the shortage is taken in proportion
  and the values wrap — at which point no free space is standing beside anything. The price is that
  entries align only as far as the cap below holds them, which is why it is asked for by name rather
  than being the default.
- **No field of an entry is ever wider than half of it, in either arrangement**
  (`plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-57`).
  The cap is a share of the entry, never a length: no measurement, no pixel value in the component
  and none at the call site. Without it `content` puts the boundary between two fields at a
  different offset in every entry — a list of mounts in a 1150px group was measured at a source of
  831px against a destination of 311px — and a column that begins somewhere new in every row is not
  a column.
  - Under `content`, a field that wants more than half is held at half and the remainder goes to
    its sibling, so on a two-field entry both land within one column gap of the middle and the
    boundary is the same in every entry.
  - **Under `even` the cap is inert and cannot bite**: the gap between the fields comes out of the
    entry before the shares are taken, so an equal share of two is already half a gap short of half
    the entry, and an equal share of three or more is shorter still. `even` reaches the cap at no
    width and for no content.
  - **A field that is the only field of its entry is not capped**, and takes the entry whole: with
    no sibling there is no boundary to align, and half a row of wash beside half a row of nothing is
    the hole a field exists to prevent.
  - **The cost is accepted and is the human's own trade**: a value needing more ink than half the
    entry wraps onto a second line instead of running past the middle of it — a volume source of ~96
    characters wants ~690px against the 575px that is half of a 1150px entry. There is no
    content-proportional escape for the long case; the alignment is the point.
- **A value longer than its field wraps inside it**, gaining no ellipsis, no truncation and no
  hidden overflow: these are the values an operator most needs to read exactly — a path, an
  environment line. The property band's rule, on this shape (`definition-list.md`, "a list row
  truncates, a property band wraps").
- **Every value reads from the leading edge**, whatever it holds and however many lines it takes.
  The component declares no text alignment of its own.
- **The fields of an entry share its height**: a wrapped value does not leave its neighbour a short
  pill against a tall one.
- **A value lays its own children out with a `--space-1` gap**: `value` is a `ReactNode`, so a value
  composed of a text node and a `Chip` — a mount destination and its `ro` / `rw` chip — is a thing
  this component contracts to lay out.
- A caption is stated for every field of an entry or for none of them: a captioned field beside an
  uncaptioned one puts their two values on different lines of the same row.
- **It draws no control and takes no callback.** Reading is not editing: the shape is the form's,
  the affordances are not — no input border, no focus ring, nothing to press. A caller that wants
  the values edited asks for `KeyValueEditor` or `RepeatableRowList`.
- Padding, type, colour, the wash and the radius are the delivered property-band ones, taken by
  name from the tokens: this component moves space, it does not restyle.
- The row gap between entries is `--space-2`, the gap between the fields of an entry `--space-2`,
  the column gap between entries the shared arrangement's `--space-6`; all tokens.

## Dependencies

- ContentColumns (`contentColumnsClassName`, form `value`)

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-18
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-54
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-55
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-56
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-57
