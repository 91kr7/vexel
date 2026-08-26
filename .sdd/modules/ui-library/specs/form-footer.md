---
module: ui-library
component: FormFooter
type: UI component
---

# FormFooter

**Purpose** → save/cancel footer for a form, with a dirty indicator and, optionally, a standing note
stating what saving will cost (e.g. a container's configuration edit).

## Contract

- `<FormFooter dirty saving? onSave onCancel saveLabel? note? />`
  - `dirty: boolean` — whether there is anything to save; the status text reads "Unsaved changes" or
    "No changes" accordingly.
  - `saving?: boolean` — while true, save is disabled and its label reads "Saving…".
  - `onSave: () => void`, `onCancel: () => void`.
  - `note?: ReactNode` — a standing statement of a consequence, drawn on the footer's leading side
    above the dirty indicator, in the cautioning tone. It is shown for as long as the footer is,
    never in response to an action, and it carries no action of its own.

## Rules and invariants

- The save action is disabled while `!dirty` or `saving`.
- A footer given no `note` draws exactly what it drew before the slot existed: the dirty indicator
  alone on the leading side, and no container around it.
- The note never replaces the dirty indicator: both are stated, the note above.

## Dependencies

- Button, Row, Stack

## Requirements served

- plan-docker_management_app/REQ-25
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-25
