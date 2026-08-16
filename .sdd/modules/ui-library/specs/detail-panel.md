---
module: ui-library
component: DetailPanel
type: UI component
---

# DetailPanel

**Purpose** → the detail surface for a selected object (e.g. a container opened from its row):
an optional header with title/subtitle, a trailing actions slot, an optional property grid, a
content body, and — depending on how the panel is left — a close control or `Escape`.

**The one question it answers** → *how is an object's detail revealed?* One shape: full width,
properties in the library's two-column grid, values left-aligned, tabs optional — and **one panel
open at a time in the whole interface**, so a screen cannot present two parallel long scrolls.

## Contract

- `<DetailPanel title? subtitle? onClose actions? properties? propertiesContentClass? children?
  dismissal? />`
  - `title?: string`, `subtitle?: string` — omit both when the object is already labelled by the
    surface the panel opens from (e.g. the table row it expands below), to avoid duplicating it.
  - `onClose: () => void` — called when the panel is dismissed, by whichever route its `dismissal`
    offers.
  - `actions?: ReactNode` — rendered in the header.
  - `properties?: DefinitionItem[]` — the object's properties, laid out as `DefinitionList` bands at
    the top of the body, above `children`. `propertiesContentClass?: ContentClass` states what those
    properties hold, from which the grid derives how many columns the panel's width carries; omitted,
    it is `'short-scalar'`.
  - `children` render as the panel's body, below the property grid.
  - `dismissal?: 'close-control' | 'opening-gesture'` (default `'close-control'`) — the presentation
    variant:
    - `'close-control'` → the panel presents its close control (accessible name `Close detail`),
      which calls `onClose`. `Escape` does nothing: the panel claims no key.
    - `'opening-gesture'` → the panel presents **no** close control and no space is reserved where it
      would have been; `Escape` calls `onClose` instead.

## Rules and invariants

- **At most one detail panel is open anywhere in the interface.** A panel being rendered closes any
  panel already open, through that panel's own `onClose` — so the screen owning it learns the panel
  is gone rather than being left holding state that says it is still open. Held by the component and
  not by each screen, which is the whole point: two lists on one screen (volumes beside networks)
  each kept their own expansion and presented two parallel long scrolls, because nothing but a
  convention said they should not. A screen cannot re-answer this, and it costs a screen nothing to
  obey — `onClose` is already required of every caller.
- The guarantee is the component's, so it holds **across lists, across panels and across screens**,
  not only within one list. A list's own half — one expanded row per list — is `DataTable`'s, by
  construction (`expandedRowKey` is one key).
- **The panel is always the full width of what it is placed in** (`width: 100%`, stated rather than
  inherited from being a block box, so it survives a flex or inline context), and never narrows
  itself. A raw payload block inside it therefore gets the panel's width, never a card column's
  leftover. Where the panel is placed remains the caller's decision; what the component refuses is
  being narrow once it is there. Above it, `DataTable` pins an open expansion to the box the list is
  read in, so the panel is never panned either.
- **Properties are stated through `properties`, in the library's two-column grid, left-aligned** —
  structural rather than a convention each screen honours or forgets. A panel that lays properties
  out any other way is a panel that declined the primitive.
- **The rule that decides `dismissal`**, and each new use is this question answered rather than a
  default drifted into: the close control is **absent where the panel's opening gesture also closes
  it** (a table row that expands and collapses on the same selection), and **present where the close
  control is the only way out**. A panel with both offers a dismissal affordance nobody asked for; a
  panel with neither is a surface with no way out.
- The default is the presentation the panel has always had, so a consumer that says nothing is
  untouched by the variant existing.
- Without the close control, nothing takes its place: no collapse link, no chevron, no rendered
  keyboard hint, and the header keeps no padding reserved for the control that is not there.
- **`Escape` is claimed only in the `'opening-gesture'` presentation**, and only while the panel is
  rendered. The claim goes through the library's escape arbitration (`escape-arbitration.md`), so:
  a menu or a dialog opened over the panel takes the key first and the panel stays open, taking the
  next one; an `Escape` typed inside a region that owns its keystrokes (a terminal in the panel's own
  body) never reaches the panel; and with no panel present the key is left entirely alone.
- `Escape` dismisses the panel from wherever the focus sits inside its body — a tab, a field, a
  button reached by `Tab` alone — and equally when the focus sits nowhere in particular.
- **On an `Escape` dismissal the point of interaction is handed to the nearest enclosing dismissal
  focus target** (the region carrying the attribute described in `escape-arbitration.md`, e.g. a
  `DataTable`'s list region) **before** `onClose` is called, so the focus is never left on a subtree
  about to be removed. When nothing enclosing declares itself a target, the focus is left where it
  is; a panel expanded inside a `DataTable` always has one.
- The panel adds no overlay surface, no overlay material and no runtime blur, in either presentation.

## Dependencies

- IconButton (`'close-control'` presentation only)
- DefinitionList (the property grid)
- Escape arbitration

## Requirements served

- plan-ui-coherence-optimisation/REQ-23
- plan-ui-coherence-optimisation/REQ-24
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30

- plan-docker_management_app/REQ-24
- plan-docker_management_app-container_detail_close/REQ-1
- plan-docker_management_app-container_detail_close/REQ-2
- plan-docker_management_app-container_detail_close/REQ-5
- plan-docker_management_app-container_detail_close/REQ-6
- plan-docker_management_app-container_detail_close/REQ-11
- plan-docker_management_app-container_detail_close/REQ-13
- plan-docker_management_app-container_detail_close/REQ-14
- plan-docker_management_app-container_detail_close/REQ-18
