---
module: app-shell
component: useFailureReport
type: frontend hook
---

# useFailureReport

**Purpose** → reports a failure a view holds as **state** — a read that failed, a transfer that
failed — through the error reporting service, once per occurrence.

## Contract

- `useFailureReport(title: string, message: string | undefined): void`
  - `message` holding a value that was not reported yet → one `reportError(title, message)`.
  - `message` empty or absent → nothing is reported, and the view is armed again.
  - returns nothing; it renders nothing.

## Rules and invariants

- **One report per occurrence** (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-6): the
  same message still standing across a re-render reports nothing, however many re-renders it
  survives, and a `title` that changes while the message stands reports nothing either.
- A message that is cleared and then arrives again — the same text included — is a new occurrence
  and reports again.
- Two failures in the same view are two calls: the hook holds one message at a time.
- Whether the report becomes a toast is the reporting service's decision, not this hook's: with
  nothing reachable it is dropped there (…/REQ-13).

## Dependencies

- ErrorReportingService (useErrorReporter)

## Requirements served

- plan-docker_management_app-inline_error_panels/REQ-5
- plan-docker_management_app-inline_error_panels/REQ-6
