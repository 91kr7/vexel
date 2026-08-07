---
module: ui-library
component: FilePicker
type: UI component
---

# FilePicker

**Purpose** → picks a file from the operator's own machine to upload (e.g. an image tarball to
load, a filesystem tarball to import), showing the chosen file's name and size (REQ-42, REQ-43).

## Contract

- `<FilePicker file onChange label? ariaLabel? accept? disabled? />`
  - `file: File | null`, `onChange(file: File | null)` — controlled selection; `onChange` is called
    with the newly chosen file, or `null` if the operator's native file dialog is dismissed without
    a choice (the previous `file` is left in place by the caller in that case, since `onChange` is
    not invoked).
  - `label?` — field label shown above the control.
  - `ariaLabel?` — accessible name for the underlying file input; falls back to `label`.
  - `accept?` — passed through to the native file input (e.g. `".tar"`).
  - `disabled?`.

## Rules and invariants

- While `file` is `null`, the trigger reads "Choose file…" and the summary reads "No file
  selected"; once a file is chosen, the trigger reads "Change file…" and the summary shows the
  file's name and formatted size.
- Choosing a new file always replaces the previous one; there is no multi-file selection.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
