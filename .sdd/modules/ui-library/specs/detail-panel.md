---
module: ui-library
component: DetailPanel
type: UI component
---

# DetailPanel

**Purpose** → the detail surface for a selected object (e.g. a container opened from its row):
an optional header with title/subtitle, a trailing actions slot, a content body, and — depending on
how the panel is left — a close control or `Escape`.

## Contract

- `<DetailPanel title? subtitle? onClose actions? children? dismissal? />`
  - `title?: string`, `subtitle?: string` — omit both when the object is already labelled by the
    surface the panel opens from (e.g. the table row it expands below), to avoid duplicating it.
  - `onClose: () => void` — called when the panel is dismissed, by whichever route its `dismissal`
    offers.
  - `actions?: ReactNode` — rendered in the header.
  - `children` render as the panel's body, below the header.
  - `dismissal?: 'close-control' | 'opening-gesture'` (default `'close-control'`) — the presentation
    variant:
    - `'close-control'` → the panel presents its close control (accessible name `Close detail`),
      which calls `onClose`. `Escape` does nothing: the panel claims no key.
    - `'opening-gesture'` → the panel presents **no** close control and no space is reserved where it
      would have been; `Escape` calls `onClose` instead.

## Rules and invariants

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
- Escape arbitration

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app-container_detail_close/REQ-1
- plan-docker_management_app-container_detail_close/REQ-2
- plan-docker_management_app-container_detail_close/REQ-5
- plan-docker_management_app-container_detail_close/REQ-6
- plan-docker_management_app-container_detail_close/REQ-11
- plan-docker_management_app-container_detail_close/REQ-13
- plan-docker_management_app-container_detail_close/REQ-14
- plan-docker_management_app-container_detail_close/REQ-18
