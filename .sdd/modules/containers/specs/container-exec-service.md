---
module: containers
component: ContainerExecService
type: backend service
---

# ContainerExecService

**Purpose** → opens an interactive command inside a running container over the Engine API and
exposes it as a duplex, resizable session.

## Contract

- `startExecSession(id, options, handlers) → Promise<InteractiveSession>`
  - `options: { cmd: string[], user?: string, workingDir?: string }` — `cmd` is the argv of the
    process to run (a shell path, or `['/bin/sh', '-c', "…"]` for a custom command); `user` and
    `workingDir` default to the container's own image defaults when omitted.
  - `handlers: { onData(chunk: Buffer), onExit(exitCode: number | null), onError(message) }`
    - `onData` fires with raw tty bytes (both the process's stdout and stderr, interleaved, since
      the session runs with a tty).
    - `onExit` fires exactly once, either when the underlying socket closes on its own or when the
      session's `close()` is called, with the exec instance's exit code (`null` when it could not be
      read, including for a caller-initiated `close()`).
  - resolves with an `InteractiveSession`:
    - `write(data: Buffer)` — sends keystrokes/input to the process.
    - `resize(cols, rows)` — propagates a terminal size change to the exec instance.
    - `close()` — signals end-of-input to the exec'd process (an end-of-transmission byte, then a
      graceful socket end) so it actually exits on the daemon, rather than leaking a shell that runs
      forever.
  - rejects with the daemon's own error when the exec instance cannot be created or started (unknown
    container, container not running, unreachable daemon).

## Rules and invariants

- Every session runs with a tty (`Tty: true`) so a single interleaved byte stream carries both
  stdout and stderr, matching what a real terminal emulator expects.
- `close()` and a daemon-initiated socket close both tear down the exec instance; no handler fires
  more than once after either.
- `close()` releases the exec'd process on the daemon: after it, the daemon reports the exec instance
  as no longer running (verified for the shell/interactive case this service exists for). A socket
  already unwritable (e.g. the daemon already closed it) is destroyed directly instead.

## Dependencies

- docker-access: EngineClient (via `getEngineClient`)

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-36
