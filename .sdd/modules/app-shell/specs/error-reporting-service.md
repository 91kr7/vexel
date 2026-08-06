---
module: app-shell
component: ErrorReportingProvider, useErrorReporter
type: frontend service
---

# Error reporting service

**Purpose** → gives every screen the same failure-reporting behavior (REQ-7): the daemon's own
error message is shown, and the screen stays usable.

## Contract

- `<ErrorReportingProvider children>` — must wrap any part of the tree that calls
  `useErrorReporter()`.
- `useErrorReporter(): { errors: AppError[], reportError(title, detail?), dismissError(id) }`
  - `AppError`: `{ id, title, detail? }`.
  - `reportError(title, detail?)` appends a new active error; `detail` is expected to carry the
    daemon's own message verbatim.
  - `dismissError(id)` removes it from `errors`.
- Calling `useErrorReporter()` outside an `ErrorReportingProvider` throws.

## Rules and invariants

- Reporting an error never clears or replaces the screen's own content; the caller (the Shell, in
  this batch) is responsible for rendering `errors` alongside the screen, not instead of it
  (REQ-7).

## Requirements served

- plan-docker_management_app/REQ-7
