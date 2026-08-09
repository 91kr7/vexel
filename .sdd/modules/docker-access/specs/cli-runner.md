---
module: docker-access
component: CLI runner
type: backend service
---

# CLI runner

**Purpose** → the local `docker` / `docker compose` / `docker buildx` complement to the Engine API:
detects presence and version, and runs a command against the active context.

## Contract

- `detectCliAvailability(): Promise<{ docker, compose, buildx }>`
  - Each entry: `{ available: boolean, version?: string }`, from `docker --version`,
    `docker compose version`, `docker buildx version` respectively.
  - A tool that is missing, or exits non-zero, or is not on `PATH`, reports `available: false`
    rather than throwing.
- `runCliCommand(command, args, endpoint, options?): CliRunHandle`
  - Spawns `command args…` targeting the active context.
  - `options.stdin?: string` — written to the child's standard input, which is then closed. Given
    even as an empty string, it closes stdin: that is how a value that must not appear in `argv`
    reaches a command (a secret on `docker login --password-stdin`, REQ-87), and how a command that
    reads standard input is stopped from waiting on input that will never come. Omitted, the
    child's standard input is left open and untouched, exactly as before.
    - When the operator has explicitly set `DOCKER_HOST`: `DOCKER_HOST` is forced from `endpoint` on
      the child's environment, so the run targets that endpoint regardless of what the server
      process itself inherited.
    - Otherwise: the child inherits the server's own environment unchanged, with no `DOCKER_HOST`
      override — the same environment a bare terminal invocation on the same machine would have.
      This is also how the runner follows a context switch (REQ-93): selecting a context writes it
      to the local Docker configuration, which the spawned CLI resolves by itself, so the CLI
      channel and the Engine API client target the same daemon without either being told twice.
      This matters beyond just dialing the right socket: a tool that keeps its own local state keyed
      by Docker context identity (e.g. buildx's current-builder file) computes that identity from
      `DOCKER_HOST`/the resolved Docker context, not from the socket path alone — forcing an
      env-derived `DOCKER_HOST` that happens to dial the same socket as the operator's real named
      context still keys that state under a *different* identity, and a later bare `docker buildx …`
      (or a later run of this very function once the operator's context resolution changes) would
      then read a different slot.
  - `CliRunHandle`: `{ cancel(), onStdout(listener), onStderr(listener), onSpawnError(listener), done: Promise<{ exitCode }> }`.
  - `cancel()` kills the child process; `done` resolves once the process has exited, with whatever
    exit code it reported (`null` if killed before exiting).
  - `onSpawnError(listener)` fires with the underlying message if the process itself could never be
    spawned (e.g. the binary went missing between detection and the run). `done` still resolves
    afterwards (Node reports `close` following the `error` event), but with a platform-dependent
    value that is not meaningful and must not be interpreted (observed as `-2`, libuv's `UV_ENOENT`,
    on macOS; other platforms/failure kinds report other values) — a caller that cares about a spawn
    failure specifically must check `onSpawnError` itself rather than infer it from `exitCode`.

## Dependencies

- docker-access: Active endpoint (`isExplicitEndpoint`)

## Requirements served

- plan-docker_management_app/REQ-110
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-87
