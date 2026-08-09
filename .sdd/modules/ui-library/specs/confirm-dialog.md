---
module: ui-library
component: ConfirmDialog
type: UI component
---

# ConfirmDialog

**Purpose** → the destructive-confirmation dialog required before any remove/kill/prune/down/leave/
log-out action: names the target and states the consequence.

## Contract

- `<ConfirmDialog open targetName consequence confirmLabel? destructive? confirmDisabled? children? onConfirm onCancel>`
  - `targetName` — rendered as the dialog title and highlighted in the body ("This will affect
    `<targetName>`.").
  - `consequence` — one-line statement of what the action does, appended after the target sentence.
  - `confirmLabel` — label of the confirm button (default `'Confirm'`).
  - `destructive` — when `true` (default), the confirm button uses the destructive Button variant.
  - `children` — extra content shown between the consequence and the buttons, for a decision the
    action needs (e.g. the scope it will act on); nothing is rendered in its place when absent.
  - `confirmDisabled` — blocks confirming while that extra content is not in a state the action can
    run on (default `false`).
  - `onConfirm` / `onCancel` — called on the respective button; cancelling (button or overlay
    click) never calls `onConfirm`.

## Rules and invariants

- The action only runs from `onConfirm`; there is no code path where closing without confirming
  triggers it (REQ-6).
- The extra content never replaces the target sentence and the consequence: whatever else the
  dialog asks, it still names what is affected and what will happen.

## Dependencies

- Modal, Button

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-96
