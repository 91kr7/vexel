---
module: raw-console
component: ConsoleCliService
type: backend service
---

# ConsoleCliService

**Purpose** → the console's CLI channel: runs an arbitrary `docker` command line against the active
context, streaming what it prints and reporting how it ended.

## Contract

- `runConsoleCliCommand(commandLine, { onOutput, onExit, onError }): () => void`
  - Rejects (throws a `ConsoleInputError`) before anything is spawned when the line is not a
    runnable `docker` command line.
  - `onOutput({ stream, text })` — every chunk as it is produced, `stream` being `'stdout'` or
    `'stderr'`; chunks are handed over unbuffered and unparsed, in arrival order.
  - `onExit(exitCode)` — the process ended; `null` when it was killed rather than exiting on its own.
  - `onError(message)` — the process never ran (e.g. the `docker` binary is gone).
  - Exactly one of `onExit` / `onError` fires, once.
  - The returned function cancels the run: the process is killed and `onExit(null)` follows.

## Rules and invariants

- The command runs exactly as it was typed, parsed into an argv — never rewritten, re-ordered or
  supplemented with flags of the application's own.
- No shell is involved: what the tokenizer produces is passed to the process as arguments, so a
  metacharacter cannot act on the server's filesystem.
- The command runs against the endpoint of the active Docker context, the same one every other area
  dials (REQ-93).
- Standard input is closed immediately: a command that would otherwise wait for input nobody can
  type fails instead of hanging the console.

## Dependencies

- raw-console: ConsoleCommand
- docker-access: CLI runner, Active endpoint

## Requirements served

- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-104
