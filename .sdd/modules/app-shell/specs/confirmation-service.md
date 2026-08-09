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
- `useConfirmation(): { confirm(request): Promise<boolean>, confirmScope(request): Promise<string[] | undefined> }`
  - `request`: `{ targetName, consequence, confirmLabel?, destructive? }`.
  - `confirm(...)` opens the dialog and resolves `true` if the human confirms, `false` if they
    cancel (Cancel button or overlay click); resolving `false` means the caller must perform no
    action.
  - `confirmScope(...)` — same confirmation, plus the choice of what the action applies to
    (REQ-96). Its request adds `{ options, initialSelectedIds?, scopeLabel? }`, `options` being
    `CheckboxOption`s (id, label, description?, note?, disabled?).
  - `confirmScope` resolves the chosen ids when the human confirms, and `undefined` when they
    cancel; `undefined` means the caller must perform no action.
  - Options are selected as `initialSelectedIds` says, or all of them when it is omitted.
- Calling `useConfirmation()` outside a `ConfirmationProvider` throws.

## Rules and invariants

- Only one confirmation request is shown at a time, whichever of the two kinds it is; a second call
  while one is pending replaces the pending dialog's request.
- A scope confirmation cannot be confirmed with nothing selected: an action with an empty scope
  would do nothing, and the human would have no way to tell that from having chosen everything.
- The selection lives in the service, not in the caller: the caller states the options once and
  receives the answer, and no re-render of the caller can leave the dialog showing a stale choice.

## Dependencies

- ui-library: ConfirmDialog, CheckboxGroup

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-96
