---
module: ui-library
component: ScrollArea
type: UI component
---

# ScrollArea

**Purpose** → a scrollable region with a consistently styled, thin scrollbar, used for dense lists
and streams (container/image lists, logs, layer trees).

## Contract

- `<ScrollArea maxHeight? children?>` — `maxHeight` caps the region's height (e.g. `'480px'`);
  content beyond it scrolls.

## Rules and invariants

- Scrolling never drives an animation or a recomputed blur (REQ-109): no scroll-linked transform,
  no `backdrop-filter`.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-109
