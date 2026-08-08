---
module: ui-library
component: SideBySideViewer
type: UI component
---

# SideBySideViewer

**Purpose** → pairs two content viewers (e.g. a changed file's two versions across two images)
side by side, each under its own header, sharing one scroll position (REQ-64).

## Contract

- `<SideBySideViewer left right maxHeight? />`
  - `SideBySideSide`: `{ header: ReactNode, content?: string, mode?: 'text' | 'hex', truncated?,
    totalSizeBytes?, emptyMessage? }` — `content: undefined` renders an `EmptyState` titled
    `emptyMessage` (default a generic "no content on this side" message) instead of a viewer, for a
    side where the path has no content of its own (added/removed on that side, a directory, a
    symlink).
  - `maxHeight?: string` (default `'360px'`) — passed to both sides' viewers.

## Rules and invariants

- Scrolling either side scrolls the other to the same position; the sync never loops (one side's
  own scroll event never re-triggers itself through the other).
- `content` present renders `TextViewer` (`mode` `'text'`, the default) or `HexDumpViewer` (`mode`
  `'hex'`), each with its own truncation notice, exactly as elsewhere in the library.

## Dependencies

- Divider, Row, Stack, EmptyState, TextViewer, HexDumpViewer

## Requirements served

- plan-docker_management_app/REQ-64
