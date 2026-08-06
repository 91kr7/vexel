---
module: containers
component: ContainerProcessesService
type: backend service
---

# ContainerProcessesService

**Purpose** → the processes running inside a container, read from the daemon on demand and
normalised into pid / user / command whatever column layout the daemon reports.

## Contract

- `ContainerProcess = { pid: number, user: string, command: string, cpuPercent?, memoryPercent? }`
- `listContainerProcesses(id) → Promise<{ titles: string[], processes: ContainerProcess[] }>`
  - `titles` — the daemon's column titles, in their original order.
  - rejects with the daemon's own error when the container does not exist or is not running.

## Rules and invariants

- The columns are located by title, case-insensitively: `PID` for the pid, the first of
  `USER`/`UID`/`OWNER` for the user, the first of `COMMAND`/`CMD`/`ARGS` for the command, and
  `%CPU`/`%MEM` for the two optional readings.
- A column the daemon does not report reads as an empty string (user, command), `0` (pid) or
  `undefined` (the percentages) — never a failure.
- When a row carries more fields than there are titles, the surplus belongs to the last column: it
  is joined back onto it, so a command containing spaces stays whole.
- The processes are reported in the daemon's order; the listing is a snapshot at call time and is
  never cached.

## Dependencies

- docker-access: EngineClient (`request`)

## Requirements served

- plan-docker_management_app/REQ-33
