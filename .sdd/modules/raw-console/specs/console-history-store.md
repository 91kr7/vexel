---
module: raw-console
component: ConsoleHistoryStore
type: backend service
---

# ConsoleHistoryStore

**Purpose** → the console's command history, kept in the local store's `console-history` namespace
so it is still there after a restart.

## Contract

- `readConsoleHistory(): ConsoleHistoryEntry[]`
  - `ConsoleHistoryEntry`: `{ id, channel: 'cli' | 'api', command, timestamp, status?, succeeded?,
    output? }` — `command` is exactly what was typed, `timestamp` an ISO-8601 instant, `status` the
    channel's own wording (`exit 0`, `HTTP 404`, `cancelled`).
  - Oldest first.
  - A stored record that is not a list, and any element of it without an id, a command and a known
    channel, is left out rather than returned: a corrupt file reads as an empty history, never as a
    broken entry.
- `appendConsoleHistoryEntry(entry): Promise<ConsoleHistoryEntry[]>`
  - `entry`: an entry without `id` (assigned here) and with an optional `timestamp` (now, when
    absent).
  - Answers with the history as it now stands, oldest first.
  - Drops the entry — answering with the unchanged history — when its command is blank, or when the
    command could carry a credential.

## Rules and invariants

- **A command that could carry a credential is never written to disk.** The console runs whatever
  the operator types with the server's own privileges; it must not also become the place a password
  ends up in a file. The judgement is `ConsoleCommand`'s `carriesSecret`, applied here rather than
  trusted from the caller, so no route can persist one by omission.
- That covers both channels: a credential in a CLI flag (`docker login -p …`) and a credential in an
  API body (`POST /auth {"Username":"u","Password":"p"}`) are both refused, since the entry's
  command is the whole line as typed, body included.
- The history is capped at the 200 most recent entries; the oldest are dropped.
- An entry's output is capped at 8192 characters, the remainder replaced by a truncation marker, so
  one image build cannot make the history file unbounded.
- Writes go through the local store, which serializes them per namespace and lands them atomically.

## Dependencies

- raw-console: ConsoleCommand
- local-persistence: LocalStore (namespace `console-history`)

## Requirements served

- plan-docker_management_app/REQ-102
- plan-docker_management_app/REQ-104
- plan-docker_management_app/REQ-114
