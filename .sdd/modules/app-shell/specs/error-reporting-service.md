---
module: app-shell
component: ErrorReportingProvider, useErrorReporter
type: frontend service
---

# Error reporting service

**Purpose** → the one way the application reports a failure: a screen hands it a title and the
daemon's own message, and one failure toast carries them. It holds no failure and draws nothing.

## Contract

- `<ErrorReportingProvider children>` — must wrap any part of the tree that calls
  `useErrorReporter()`, and must itself sit under a `ToastProvider` and a
  `ConnectionStatusProvider`.
- `useErrorReporter(): { reportError(title, detail?) }`
  - `reportError(title, detail?)` raises one toast in the `danger` tone, titled `title` and
    carrying `detail` as its message; `detail` is expected to be the daemon's own message verbatim.
    The toast carries no action control.
  - It returns nothing, and nothing can be read back: there is no list of reported failures and no
    dismissal — a toast is dismissed by the toast component.
- Calling `useErrorReporter()` outside an `ErrorReportingProvider` throws.

## Rules and invariants

- **One report, one toast.** Every call raises a further toast, including a repeat of a title and a
  message already reported (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-6). What
  happens when a fourth is on screen is the toast component's own rule — the oldest leaves — and
  this service neither counts nor caps (…/REQ-8).
- **A report raised while nothing is reachable is dropped**, silently: with
  `useConnectionStatus().daemon.reachable` false, no toast is raised at all. The header report is
  the only place the lost connection is told (…/REQ-13).
- **`reportError` keeps one identity for the life of the provider**: reachability is read through a
  ref, so a connection changing state re-runs no effect that lists `reportError` among its
  dependencies.
- Reporting never touches what a screen shows: the screen underneath keeps its content and stays
  usable.

## Dependencies

- ui-library: useToast
- ConnectionStatusService (useConnectionStatus)

## Requirements served

- plan-docker_management_app-inline_error_panels/REQ-5
- plan-docker_management_app-inline_error_panels/REQ-6
- plan-docker_management_app-inline_error_panels/REQ-7
- plan-docker_management_app-inline_error_panels/REQ-8
- plan-docker_management_app-inline_error_panels/REQ-13
