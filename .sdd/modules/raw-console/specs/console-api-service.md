---
module: raw-console
component: ConsoleApiService
type: backend service
---

# ConsoleApiService

**Purpose** → the console's API channel: issues an arbitrary Engine API call against the active
daemon and hands back the status and body exactly as the daemon answered them.

## Contract

- `callEngineApi(commandLine): Promise<{ method, path, status, body, contentType? }>`
  - `commandLine` follows the Engine API entry grammar (`[METHOD] /path[?query] [body]`); a line
    that does not is rejected with a `ConsoleInputError`, nothing being dialed.
  - `path` in the answer is the path actually dialed, version prefix included.
  - `status` is the daemon's own status, error statuses included: a `404` or a `409` is a result to
    show, not a failure to raise.
  - `body` is the response body verbatim — not parsed, not re-serialized, not pretty-printed.
  - Rejects with a `DockerDaemonError` only when the daemon could not be reached at all: there is no
    status to report in that case.

## Rules and invariants

- A body given on the entry line travels as typed — it is the raw rest of the line after the path,
  its quotes and its spacing intact — with `Content-Type: application/json`. Only a body wrapped in
  a single pair of outer quotes has those removed, that being shell-style quoting rather than part
  of the body.
- The call goes to the daemon of the active Docker context (REQ-93).

## Dependencies

- raw-console: ConsoleCommand
- docker-access: EngineClient (`requestRaw`)

## Requirements served

- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-104
