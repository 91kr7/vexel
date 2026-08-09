---
module: raw-console
component: Console endpoints
type: REST endpoint
---

# Console endpoints

**Purpose** → exposes both console channels, the classification a command is confirmed on, and the
persisted history to the client.

## Contract

- `POST /api/console/classify` → what the typed line is, running nothing.
  - request: `{ channel: 'cli' | 'api', command }`.
  - `400` → `command` is not a string, or `channel` is neither `cli` nor `api`.
  - `200` → `{ destructive, reason?, carriesSecret }`.
- `POST /api/console/cli` → runs a CLI entry, streaming its output.
  - request: `{ command }`.
  - `400` → `command` is not a string, or is not a runnable `docker` command line (the line is
    rejected before the stream opens, so an unrunnable line is a rejected request rather than a
    stream carrying one error).
  - `200` → `application/x-ndjson`, one JSON object per line:
    - `{ "type": "output", "stream": "stdout" | "stderr", "text": … }` per chunk, as produced
    - `{ "type": "exit", "exitCode": number | null }` — last line of a run that ended
    - `{ "type": "error", "message": … }` — last line when the process never ran
  - Closing the connection cancels the command.
- `POST /api/console/api` → issues an Engine API call.
  - request: `{ command }` — the entry line, e.g. `POST /containers/abc/stop`.
  - `400` → `command` is not a string, or does not follow the entry grammar.
  - `200` → `{ method, path, status, body, contentType? }` — the daemon's own status and body, an
    error status included. The endpoint answers `200` for a daemon `404`: the daemon's answer is the
    result, not a failure of this call.
  - `502` (or the error's own status) → the daemon could not be reached, `{ error: message }`.
- `GET /api/console/history` → `200` → `{ entries: ConsoleHistoryEntry[] }`, oldest first.
- `POST /api/console/history` → appends one entry.
  - request: `{ channel, command, status?, succeeded?, output? }`.
  - `400` → `command` is not a string, or `channel` is neither `cli` nor `api`.
  - `200` → `{ entries }` — the history as it now stands; unchanged when the entry was dropped for
    carrying a possible credential.

## Rules and invariants

- The CLI stream is cancelled on the **response** closing, not the request: a request emits its
  close as soon as its body has been read, which is before the command has even started.
- No endpoint rewrites a command: what is classified, run and stored is the line as it was typed.

## Dependencies

- raw-console: ConsoleCommand, ConsoleCliService, ConsoleApiService, ConsoleHistoryStore

## Requirements served

- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-102
- plan-docker_management_app/REQ-112
- plan-docker_management_app/REQ-114
