---
module: raw-console
component: useConsole
type: frontend hook
---

# useConsole

**Purpose** → the console's own state: the history recalled at startup, the entries this session
adds, and the execution of a command over either channel with its output arriving as it is
produced.

## Contract

- `useConsole(): { entries, loaded, error?, running, recallable, classify, run, cancel }`
  - `entries: { id, channel, command, lines, status?, succeeded?, running, persisted, restored }[]`,
    oldest first — the persisted history first, then what this session ran.
    - `lines: { id, text, stream }[]`, `stream` being `'stdout' | 'stderr'`.
    - `persisted` is false for a command that could carry a credential: it stays in this session and
      never reaches the history file.
    - `restored` is true for an entry read back from the history rather than run here.
  - `loaded` — the history read has settled (either way).
  - `error` — the message of the last failed history read or append; unset once a read succeeds.
  - `running` — an entry is still producing output.
  - `recallable: string[]` — the commands of every entry, oldest first.
  - `classify(channel, command)` → the server's classification, running nothing.
  - `run(channel, command, { persist? })` → adds an entry and resolves when it has ended.
  - `cancel()` → cancels the running CLI entry.

## Rules and invariants

- A payload that is not `{ entries: [...] }`, or that holds an element without an id, a command and
  a known channel, is a failed read: the message is reported and nothing is stored, so the
  transcript is never handed an entry without a command to show.
- The history is read **once per mount**, not once per effect setup: in development the application
  mounts under React's StrictMode, whose setup runs twice, and the screen opening is what a read
  answers to.
- **Nothing this session produced is ever dropped by a load landing late.** The history read merges
  *under* the entries already present — restored ones first, this session's after — instead of
  replacing them, so a command run before the read settles keeps the entry its output is going
  into.
- **The merge is idempotent.** It leaves out every entry already in the transcript — one restored by
  an earlier merge, or one this session appended to the history file — so merging a second time
  cannot show the same entry twice, nor collide two entries on one id.
- Output arrives as chunks, not lines: a chunk that does not end in a newline leaves the last line
  open, and the next chunk of the same stream continues it rather than starting another line. A
  trailing carriage return is dropped.
- An entry ends with a status in its channel's terms: `exit <code>` or `cancelled` for the CLI
  channel, `HTTP <status>` for the API one; a failure of the call itself ends the entry as `failed`
  with the message on its `stderr` side.
- `succeeded` is true only for `exit 0` and for an API status below 400.
- An entry is appended to the history once it has ended, and only when `persist` is not false; a
  failed append is reported but never loses the entry from the session.
- Cancelling is a normal end, not a failure: the entry keeps the output it had produced.
- Leaving the screen cancels a running command rather than leaving a process behind on the server;
  such an entry, having never ended on its own, is not appended to the history.

## Dependencies

- raw-console: Console client

## Requirements served

- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-102
- plan-docker_management_app/REQ-114
