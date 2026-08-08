---
module: ui-library
component: TransferProgressDialog
type: UI component
---

# TransferProgressDialog

**Purpose** → the dialog for a long-running cancellable determinate operation reporting numeric
progress (e.g. saving/loading an image tarball, exporting a container's filesystem, analyzing an
image's layers): a progress bar with a genuine cancel action while it runs, and a close action once
it ends.

## Contract

- `<TransferProgressDialog open title description? currentBytes totalBytes? status errorMessage?
  onCancel onClose children? formatCaption? />`
  - `currentBytes: number`, `totalBytes?: number` — the current/total progress units; `totalBytes`
    known renders a determinate bar, unknown an indeterminate one.
  - `formatCaption?: (currentBytes, totalBytes?) => string` — overrides the caption entirely, for a
    progress unit other than bytes (e.g. a layer count); omitted, the default byte-formatted caption
    applies: `"<current> / <total>"` when `totalBytes` is known, `"<current> transferred"`
    otherwise.
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
