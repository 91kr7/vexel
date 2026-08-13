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
  onCancel onClose onRetry? children? formatCaption? />`
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
  - `onRetry?` — when given, a retry action is offered **inside the failure report itself** (the
    `ErrorBanner`'s own retry), for an operation whose caller has a way to start it again; omitted,
    the failure offers only its dismissal. It never replaces the Close action and never appears
    while `status` is `'active'` or `'done'`.
  - `children` — rendered only while `status` is `'done'` (e.g. the resulting references).
  - `autoCloseOnDone?: boolean` — opt-in, **default off**: once the completed state has been
    rendered, the dialog closes itself after one second by calling the same `onClose` a manual close
    calls.

## Rules and invariants

- Exactly one of Cancel (active) or Close (done/error) is offered at a time; the dialog is never
  left with no way to dismiss it.
- The progress bar is not shown while `status` is `'error'`: the `ErrorBanner` takes its place.
- **Completed state.** At `status === 'done'` the caption reads `Completed` and the bar is full, the
  two agreeing in the same render. The completion wording is defined here and **replaces**
  `formatCaption`'s output entirely: no state exists in which the bar is full and the caption names
  a phase, whatever a caller's `formatCaption` returns (including the "no phase reported yet"
  wording of a run served from a cache). No caller supplies a completion wording of its own.
- **Completion is announced.** At the moment `status` becomes `'done'` the wording is exposed as a
  status message (a polite live region, present in the dialog from the start and empty until then),
  and focus does not move.
- **Self-dismissal is opt-in and off by default.** Without `autoCloseOnDone` the dialog waits to be
  dismissed, however long. The default is off because a consumer that forgets the prop must get a
  dialog that waits, never one that vanishes carrying the only copy of a result.
- The delay is **one second, fixed** — not configurable, not adaptive, not a function of how long
  the operation took — and it is counted from the moment the completed state is *rendered*, so the
  completed caption is seen rather than skipped.
- **`error` and `active` arm nothing**: a failed operation stays on screen with its cause until it
  is dismissed, however long, and a running one never arms a close. Cancelling is unchanged.
- **A pending self-dismissal belongs to the completion that armed it.** It is armed on the
  transition into `done` only, and abandoned on unmount, on `open` becoming false, on a manual
  close, and on leaving `done` (a re-run started inside the second). It never closes a dialog it did
  not arm.
- The dialog stays dismissible by hand throughout that second, and `onClose` is called **exactly
  once** however the manual close and the elapsed delay arrive — including at the same instant.
- Nothing else differs between a self-dismissing and a hand-dismissed run: the closing path is the
  caller's own `onClose` in both cases, so the view underneath and the keyboard position are one
  behaviour and not two.

## Dependencies

- Modal, Button, ProgressBar, ErrorBanner

## Requirements served

- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
- plan-docker_management_app-progress_completion_autoclose/REQ-1
- plan-docker_management_app-progress_completion_autoclose/REQ-2
- plan-docker_management_app-progress_completion_autoclose/REQ-3
- plan-docker_management_app-progress_completion_autoclose/REQ-4
- plan-docker_management_app-progress_completion_autoclose/REQ-6
- plan-docker_management_app-progress_completion_autoclose/REQ-7
- plan-docker_management_app-progress_completion_autoclose/REQ-8
- plan-docker_management_app-progress_completion_autoclose/REQ-9
- plan-docker_management_app-progress_completion_autoclose/REQ-10
- plan-docker_management_app-progress_completion_autoclose/REQ-11
- plan-docker_management_app-progress_completion_autoclose/REQ-13
- plan-docker_management_app-progress_completion_autoclose/REQ-14
- plan-docker_management_app-progress_completion_autoclose/REQ-15
- plan-docker_management_app-progress_completion_autoclose/REQ-16
