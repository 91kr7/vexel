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
- `runCliCommand(command, args, endpoint): CliRunHandle`
  - Spawns `command args…` with `DOCKER_HOST` set from `endpoint` so the run targets the active
    context.
  - `CliRunHandle`: `{ cancel(), onStdout(listener), onStderr(listener), done: Promise<{ exitCode }> }`.
  - `cancel()` kills the child process; `done` resolves once the process has exited, with whatever
    exit code it reported (`null` if killed before exiting).

## Requirements served

- plan-docker_management_app/REQ-110
