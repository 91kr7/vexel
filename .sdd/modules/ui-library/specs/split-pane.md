---
module: ui-library
component: SplitPane
type: UI component
---

# SplitPane

**Purpose** → a two-pane surface — a fixed-width side next to a flexible one, divided by a
hairline — for a tree/list next to its detail view (e.g. an image's browsed filesystem) (REQ-52).

## Contract

- `<SplitPane start end startWidth? maxHeight? fill?>`
  - `start: ReactNode` — the fixed-width leading pane.
  - `end: ReactNode` — the flexible trailing pane, filling the remaining width.
  - `startWidth?: string` — CSS width of the start pane (default `'320px'`).
  - `maxHeight?: string` — caps the pane's height; each side scrolls independently within it when
    its own content exceeds it (the content itself owns its scroll region, e.g. via `ScrollArea` or
    `TreeView`'s own `maxHeight`).
  - `fill?: boolean` (default `false`) — the pane takes the height of the **region it is placed in**
    instead of a stated maximum, and each side scrolls independently within whatever that region
    turns out to be.

## Rules and invariants

- The two panes keep their positions and their widths whether or not the trailing pane has content:
  a selection never moves or re-widths the leading pane.
- In `fill`, the **trailing pane's content is aligned to the top** of its column and scrolls within
  it, so an idle placeholder does not float in the middle of a tall column and a long preview
  lengthens nothing and moves the leading pane not at all.
- In `fill`, **below the product's existing 720px phone breakpoint the two panes stack**, `start`
  first and keeping the larger share of the height, and the hairline divides them along the axis they
  are then stacked on. No breakpoint of its own is invented: it is the one the frame already uses.
- Each stacked pane starts from its own content and the leading one takes twice the share of what is
  left over. Deliberately not a zero flex basis: a pane's height is only definite once the surface
  around it has reached its own bound, and a zero basis on a surface that has not is a fixed point at
  zero — measured, both panes 0px tall.
- The delivered `startWidth` / `maxHeight` behaviour is **preserved exactly** for callers that do not
  ask for `fill`. The start width travels as a custom property rather than as an inline `width`, so
  the stacked breakpoint can drop it in the stylesheet; what it computes to is unchanged.
- Adds no blur surface and no selector to the blur allow-list.

## Dependencies

- Divider

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app-filesystem_browser_layout/REQ-9
- plan-docker_management_app-filesystem_browser_layout/REQ-10
- plan-docker_management_app-filesystem_browser_layout/REQ-11
- plan-docker_management_app-filesystem_browser_layout/REQ-12
