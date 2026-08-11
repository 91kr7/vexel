---
module: ui-library
component: ScrollArea
type: UI component
---

# ScrollArea

**Purpose** → a scrollable region with a consistently styled, thin scrollbar, used for dense lists
and streams (container/image lists, logs, layer trees).

## Contract

- `<ScrollArea maxHeight? onScroll? children?>` — `maxHeight` caps the region's height (e.g.
  `'480px'`); content beyond it scrolls. `onScroll` is called with the native scroll event, used by
  callers that need scroll position (e.g. DataTable's virtualisation). Forwards its `ref` to the
  scrollable element.

## Rules and invariants

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
