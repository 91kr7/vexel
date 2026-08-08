---
module: ui-library
component: SplitPane
type: UI component
---

# SplitPane

**Purpose** → a two-pane surface — a fixed-width side next to a flexible one, divided by a
hairline — for a tree/list next to its detail view (e.g. an image's browsed filesystem) (REQ-52).

## Contract

- `<SplitPane start end startWidth? maxHeight?>`
  - `start: ReactNode` — the fixed-width leading pane.
  - `end: ReactNode` — the flexible trailing pane, filling the remaining width.
  - `startWidth?: string` — CSS width of the start pane (default `'320px'`).
  - `maxHeight?: string` — caps the pane's height; each side scrolls independently within it when
    its own content exceeds it (the content itself owns its scroll region, e.g. via `ScrollArea` or
    `TreeView`'s own `maxHeight`).

## Dependencies

- Divider

## Requirements served

- plan-docker_management_app/REQ-52
