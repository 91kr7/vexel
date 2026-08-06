---
module: ui-library
component: ConfirmDialog
type: UI component
---

# ConfirmDialog

**Purpose** → the destructive-confirmation dialog required before any remove/kill/prune/down/leave/
log-out action: names the target and states the consequence.

## Contract

- `<ConfirmDialog open targetName consequence confirmLabel? destructive? onConfirm onCancel>`
  - `targetName` — rendered as the dialog title and highlighted in the body ("This will affect
    `<targetName>`.").
  - `consequence` — one-line statement of what the action does, appended after the target sentence.
  - `confirmLabel` — label of the confirm button (default `'Confirm'`).
  - `destructive` — when `true` (default), the confirm button uses the destructive Button variant.
  - `onConfirm` / `onCancel` — called on the respective button; cancelling (button or overlay
    click) never calls `onConfirm`.

## Rules and invariants

- The action only runs from `onConfirm`; there is no code path where closing without confirming
  triggers it (REQ-6).

## Dependencies

- Modal, Button

## Requirements served

- plan-docker_management_app/REQ-6
