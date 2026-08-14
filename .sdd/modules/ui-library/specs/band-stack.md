---
module: ui-library
component: BandStack
type: UI component
---

# BandStack

**Purpose** → the arrangement of a surface's interior: **bands of chrome, each the height of its own
content, above one region that takes whatever height is left**. It is what a surface uses instead of
stating a pixel height for its main region.

## Contract

Description:

- a vertical arrangement: the bands in the order given, then the one filling region under them.

```markdown
<BandStack bands fill />
```

- `bands: ReactNode[]` — the chrome bands, in reading order. Each is a band of the arrangement
  itself: they are **not wrapped**, so nothing sits between a band and the arrangement that could
  claim height of its own. A band given as `null` leaves nothing behind — not an empty band, and not
  the spacing one would have taken.
- `fill: ReactNode` — the one region that absorbs the remaining height. **Exactly one, and the type
  is what refuses a second**: there is one slot and no way to designate another, so `fill` holding
  two nodes is two nodes inside one region and never two regions.

Shows:

- each band at the height of its own content, in the order given, separated by the library's own
  band spacing.
- the filling region under them, occupying whatever height is left over.

## Rules and invariants

- **A maximum, not a height.** The arrangement states no height and accepts none: it takes what the
  container it is placed in offers. Two consequences, and both are the point:
  - with less content than that bound, the arrangement is the size of its own content and **the
    filling region does not stretch** — a surface with little to show stays short;
  - with more, the filling region **shrinks against the bound**, so it is handed a *definite* height
    — which is what lets its content scroll and virtualise inside it, instead of pushing the whole
    arrangement past its container and leaving the container itself scrolling.
- The arrangement is **never a scroll region**: what scrolls is inside the filling region.
- A surface holding one has to be a column that hands its own bounded height down; the dialog
  surface does this for the arrangement it contains and for no other dialog (see `modal.md`).
- No caller may state a length: there is no prop for one, which is what stops the pixel constants
  this arrangement replaces from coming back.
- Every gap comes from a design token.
- Domain-agnostic: it knows nothing of what a band or the region contains.
- Adds no surface, no padding, no title and no chrome of its own; no blur surface, and no selector on
  the blur allow-list.

## Dependencies

- none (a layout primitive)

## Requirements served

- plan-docker_management_app-filesystem_browser_layout/REQ-2
- plan-docker_management_app-filesystem_browser_layout/REQ-5
- plan-docker_management_app-filesystem_browser_layout/REQ-6
- plan-docker_management_app-filesystem_browser_layout/REQ-7
- plan-docker_management_app-filesystem_browser_layout/REQ-21
- plan-docker_management_app-filesystem_browser_layout/REQ-25

## Not yet inherited by three sibling dialogs — a recorded breach

`ImageDiffView`, `LayerExplorer` and `LayerEfficiencyView` **still state pixel heights in feature
code** (`maxHeight="480px"` and `"360px"` on the diff, `"320px"` on the explorer). That is a standing
breach of the project rule that no size is hard-coded outside this library, it is recorded here
rather than excused, and it was left **deliberately** by
`plan-docker_management_app-filesystem_browser_layout` (its REQ-20) so that a regression on any of
those three stays attributable to the report that asks for it. Each is expected to inherit this
arrangement when it is taken. Until then `client/e2e/support/pinned-region.ts` keeps the fact
fail-able: each of the three is asserted to measure the same at two viewport heights, and that
assertion is deleted by the report that re-lays its dialog out.
