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
- Operating the picker with a real pointer leaves the surface it sits on where it was: its visually
  hidden file input is drawn within the picker's own box, so focusing it scrolls nothing.

## Measured, and deliberately left untouched

This control carries the same off-screen shape as Toggle's hidden checkbox, and Toggle's was
displaced (see `toggle.md`). This one was **measured with a real pointer, not argued about**, at an
813×800 viewport, in both dialogs that use it — Images & layers, "Load tarball" and "Import
filesystem" — clicking "Choose file…" and, separately, the field label, which is a real `<label for>`
route to the same input:

- hidden input **23.8px** from the "Choose file…" trigger and **1.4px** from the field label — inside
  the control either way;
- dialog box identical before and after the click (`y=278` / `y=253.6` respectively), no scroll
  offset changed anywhere;
- its frame of reference is the dialog's own raised surface, with **no scrolling element between the
  two** — the condition in `toggle.md` is not met.

It measures clean, so it was **not edited**, and no standing check was invented for it: a remedy
applied to something never shown to be broken cannot be verified as having achieved anything. The
measurement is recorded here so the next reader inherits it instead of re-deriving it — or "fixing" a
working control.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
- plan-docker_management_app-toggle_focus_scroll/REQ-7
- plan-docker_management_app-toggle_focus_scroll/REQ-9
