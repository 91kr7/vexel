---
module: ui-library
component: TransferProgressDialog
type: UI component
---

# TransferProgressDialog

**Purpose** → the dialog for a long-running byte transfer (e.g. saving/loading an image tarball,
exporting a container's filesystem): a byte progress bar with a genuine cancel action while the
transfer runs, and a close action once it ends.

## Contract

- `<TransferProgressDialog open title description? currentBytes totalBytes? status errorMessage?
  onCancel onClose children? />`
  - `currentBytes: number`, `totalBytes?: number` — `totalBytes` known renders a determinate bar and
    a `"<current> / <total>"` caption; unknown renders an indeterminate bar and a `"<current>
    transferred"` caption.
  - `status: 'active' | 'done' | 'error'`.
  - `errorMessage?` — shown (in an `ErrorBanner`) only while `status` is `'error'`.
  - `onCancel` — called by the Cancel action, shown only while `status` is `'active'`, and by the
    overlay/close control while active.
  - `onClose` — called by the Close action, shown once `status` is `'done'` or `'error'`, and by the
    overlay/close control at that point.
  - `children` — rendered only while `status` is `'done'` (e.g. the resulting references).

## Rules and invariants

- Exactly one of Cancel (active) or Close (done/error) is offered at a time; the dialog is never
  left with no way to dismiss it.
- The progress bar is not shown while `status` is `'error'`: the `ErrorBanner` takes its place.

## Dependencies

- Modal, Button, ProgressBar, ErrorBanner

## Requirements served

- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
