---
module: app-shell
component: ConfirmationProvider, useConfirmation
type: frontend service
---

# Confirmation service

**Purpose** → gives every screen the same destructive-confirmation behavior (REQ-6) without each
one building its own dialog.

## Contract

- `<ConfirmationProvider children>` — must wrap any part of the tree that calls
  `useConfirmation()`; renders the single, shared `ConfirmDialog` instance.
- `useConfirmation(): { confirm(request): Promise<boolean> }`
  - `request`: `{ targetName, consequence, confirmLabel?, destructive? }`.
  - `confirm(...)` opens the dialog and resolves `true` if the human confirms, `false` if they
    cancel (Cancel button or overlay click); resolving `false` means the caller must perform no
    action.
- Calling `useConfirmation()` outside a `ConfirmationProvider` throws.

## Rules and invariants

- Only one confirmation request is shown at a time; a second `confirm()` call while one is pending
  replaces the pending dialog's request.

## Dependencies

- ui-library: ConfirmDialog

## Requirements served

- plan-docker_management_app/REQ-6
