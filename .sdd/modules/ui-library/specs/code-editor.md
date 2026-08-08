---
module: ui-library
component: CodeEditor
type: UI component
---

# CodeEditor

**Purpose** → an editable monospace code surface with a line-number gutter, a dirty indicator and a
validation status-line slot — e.g. a compose file editor.

## Contract

- `<CodeEditor value onChange dirty? readOnly? maxHeight? statusLine? ariaLabel? />`
  - `value: string`, `onChange: (value: string) => void` — called with the full text on every edit.
  - `dirty?: boolean` (default `false`) — shows an "Unsaved changes" indicator above the block.
  - `readOnly?: boolean` (default `false`).
  - `maxHeight?: string` (default `'420px'`) — caps the block's height; taller content scrolls.
  - `statusLine?: ReactNode` — rendered below the block (e.g. a valid/invalid validation summary).
  - `ariaLabel?: string` — accessible name of the editable region.

Shows:

- one line number per line of `value` in a gutter, always in the same row as its line of text.

## Rules and invariants

- The gutter's line count always equals `value.split('\n').length` (or `1` for an empty value), and
  stays aligned with the text without a separate scroll to synchronize.

## Dependencies

- (none — self-contained)

## Requirements served

- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-116
