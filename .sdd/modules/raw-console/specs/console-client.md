---
module: raw-console
component: Console client
type: frontend data client
---

# Console client

**Purpose** → typed `fetch` wrapper for the console endpoints: classification, both channels, and
the history.

## Contract

- `classifyConsoleCommand(channel, command): Promise<{ destructive, reason?, carriesSecret }>`
- `runConsoleCliCommand(command, onOutput, signal?): Promise<{ exitCode, cancelled }>`
  - `onOutput({ stream, text })` is called for every chunk as it arrives, in order.
  - Aborting `signal` closes the connection — which is what cancels the command on the server — and
    the call resolves with `{ exitCode: null, cancelled: true }` instead of failing.
  - Rejects with the server's own message when the line was refused, and when the stream ended
    without an exit status.
- `callEngineApi(command): Promise<{ method, path, status, body, contentType? }>`
  - A daemon status of `404` or `409` resolves; only a request the server refused, or a daemon it
    could not reach, rejects.
- `fetchConsoleHistory(): Promise<{ entries }>`
- `appendConsoleHistory(entry): Promise<{ entries }>`
- Every rejection carries the server's `error` message when there is one, otherwise
  `"Request failed with HTTP <status>"`.

## Rules and invariants

- The CLI channel is read straight off the `fetch` response body as newline-delimited JSON:
  `EventSource` cannot issue a POST, and a command's output is unbounded.

## Requirements served

- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-102
- plan-docker_management_app/REQ-112
- plan-docker_management_app/REQ-114
