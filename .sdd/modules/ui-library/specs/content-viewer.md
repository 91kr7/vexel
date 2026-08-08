---
module: ui-library
component: TextViewer, HexDumpViewer
type: UI component
---

# TextViewer, HexDumpViewer

**Purpose** → previews a file's content (e.g. a browsed image filesystem entry): as line-numbered
monospace text, or as a hex dump, either with a truncation notice when the caller reports the file
was too large to read in full (REQ-59).

## Contract

- `<TextViewer content truncated? totalSizeBytes? maxHeight? scrollRef? onScroll? />`
  - `content: string` — split on `\n` and rendered one line per row, each with its 1-based line
    number in a gutter.
  - `truncated?: boolean` — when `true`, a `FieldMessage` below the content states the preview is
    truncated, naming `totalSizeBytes` when given.
  - `maxHeight?: string` (default `'360px'`) — caps the block's height with a scrollbar.
  - `scrollRef?`, `onScroll?` — forwarded to the internal scrollable element, so a caller pairing two
    viewers (`SideBySideViewer`) can read/drive their scroll position in sync.
- `<HexDumpViewer content truncated? totalSizeBytes? maxHeight? scrollRef? onScroll? />`
  - `content: string` — a preformatted hex dump (offset, hex bytes, ASCII column per line), computed
    by the caller; rendered verbatim in a monospace block.
  - `truncated?`, `totalSizeBytes?`, `maxHeight?`, `scrollRef?`, `onScroll?` — same as `TextViewer`.

## Dependencies

- ScrollArea, FieldMessage

## Requirements served

- plan-docker_management_app/REQ-59
- plan-docker_management_app/REQ-64
