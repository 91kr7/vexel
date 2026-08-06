---
module: ui-library
component: FormFooter
type: UI component
---

# FormFooter

**Purpose** → save/cancel footer for a form, with a dirty indicator (e.g. a container's
configuration edit).

## Contract

- `<FormFooter dirty saving? onSave onCancel saveLabel? />`
  - `dirty: boolean` — whether there is anything to save; the status text reads "Unsaved changes" or
    "No changes" accordingly.
  - `saving?: boolean` — while true, save is disabled and its label reads "Saving…".
  - `onSave: () => void`, `onCancel: () => void`.

## Rules and invariants

- The save action is disabled while `!dirty` or `saving`.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-25
