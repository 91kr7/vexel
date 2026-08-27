---
module: ui-library
component: ScrollArea
type: UI component
---

# ScrollArea

**Purpose** → a scrollable region with a consistently styled, thin scrollbar, used for dense lists
and streams (container/image lists, logs, layer trees).

## Contract

- `<ScrollArea maxHeight? onScroll? inset? children?>` — `maxHeight` caps the region's height (e.g.
  `'480px'`); content beyond it scrolls. `onScroll` is called with the native scroll event, used by
  callers that need scroll position (e.g. DataTable's virtualisation). Forwards its `ref` to the
  scrollable element.
- `inset` (default off) → the region leaves room around what it scrolls:
  - a surface at the region's edge draws the whole of its drop shadow instead of having it clipped
    by the scroller;
  - the scrollbar has a gutter of its own instead of resting on the content's trailing edge, and the
    gutter is reserved whether or not the content is long enough to scroll, so the region's content
    does not change width when it grows past the region.
  - off, the region adds nothing at all to the box its content is measured against.

## Rules and invariants

- **The bare region is the default, and the inset is asked for by name.** Eight of the library's own
  surfaces scroll through this one — `LogStream`, `ConsoleSurface`, `DataTable`, `TreeView`,
  `ContentViewer` (twice), `CodeViewer` and `EventStream` — and each aligns something of its own
  against its box: a sticky header, a virtualised run of rows, a gutter of line numbers. None of them
  changes box because another consumer needed room, and a consumer that needs room asks for `inset`
  rather than stating a value at its own call site.
- The inset is one bounded set of values, stated once here and nowhere else: it is the geometry of
  the library's own `--shadow-2`, so a `Card` at the edge of an inset region is fully drawn.
- Scrolling never drives an animation, and a scrollable region never blurs
  (`plan-docker_management_app/REQ-109`): no scroll-linked transform, no `backdrop-filter` on the
  region, its scroller or its content.
- **One named exception across the application**, and it is not this component's own: the log
  stream's floating "Jump to live" control (see `log-stream.md`) is a blurred surface pinned over a
  scrolled region, so while it is on screen a scroll does resample its backdrop
  (plan-liquid_glass_overlays/REQ-17). That is a risk taken against
  `plan-docker_management_app/REQ-109` knowingly, with the human's decision and the withdrawal
  order recorded in `plan-liquid_glass_overlays/requirements.md` ("Departures and accepted risks");
  nothing else in a scrolled region may blur.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-109
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-53
