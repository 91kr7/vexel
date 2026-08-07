---
module: ui-library
component: FormDialog
type: UI component
---

# FormDialog

**Purpose** → the dialog shell for a short create/pull/tag form (e.g. "Pull image", "Tag image"):
title, one-line description, a form body slot, and a cancel/submit footer.

## Contract

- `<FormDialog open title description? submitLabel? submitting? submitDisabled? onSubmit onCancel>`
  - `description?` — one line shown above the form body.
  - `submitLabel?` — label of the submit button (default `'Submit'`); shows `'Working…'` while
    `submitting` is `true`.
  - `submitDisabled?` — disables submit regardless of `submitting` (e.g. an empty required field).
  - `onSubmit` / `onCancel` — called on the respective button; cancelling (button or overlay click)
    never calls `onSubmit`.
  - `children` — the form body, rendered below the description.

## Rules and invariants

- Submit is disabled whenever `submitting` or `submitDisabled` is `true`; cancel is disabled only
  while `submitting`, so an in-flight operation cannot be dismissed as if it never started.

## Dependencies

- Modal, Button

## Requirements served

- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
