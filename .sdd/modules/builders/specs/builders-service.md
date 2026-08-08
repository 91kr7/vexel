---
module: builders
component: BuildersService
type: backend service
---

# BuildersService

**Purpose** → buildx builder inventory and management through the local CLI channel: name, driver,
endpoint, supported platforms, status and cache size, which builder is active, plus create, remove
and select-active.

## Contract

- `listBuilders(): Promise<BuilderSummary[]>`
  - `BuilderSummary`: `{ name, driver, endpoint, platforms: string[], status, active: boolean,
    cacheBytes? }`.
  - `platforms` is the union of every node's platforms; `endpoint` is the first node's own endpoint.
  - `status` is `"running"` if any node reports running, otherwise the first node's own status, or
    `"unknown"` when the builder has no node.
  - `active` reflects buildx's own "current" builder.
  - `cacheBytes` is the sum of that builder's own build-cache record sizes; omitted (not zero) when
    it could not be read, e.g. the builder is not running.
- `createBuilder(input): Promise<BuilderSummary>`
  - `input`: `{ name, driver, endpoint?, platforms: string[] }`.
  - Rejects with the daemon's own message on a name collision or an invalid driver/endpoint.
  - Resolves with the newly created builder's own summary.
- `removeBuilder(name): Promise<void>`
  - Rejects with the daemon's own message if the builder does not exist or refuses removal.
- `useBuilder(name): Promise<BuilderSummary>`
  - Sets `name` as the builder used by default; resolves with its resulting summary (now `active`).

## Rules and invariants

- Every call goes through the CLI channel (`docker buildx …`), never a direct daemon socket call.
- `docker buildx ls`/`du` output is read as newline-delimited JSON, a single bare JSON object (the
  one-entry case) or a single JSON array — never assumed to be exactly one of those shapes; a
  genuinely malformed output surfaces as a rejection rather than being silently misread.
- A non-zero exit or a spawn failure of the underlying CLI command rejects with a `DockerDaemonError`
  (`docker-access`, code `DaemonRejected`) carrying the daemon's own message, so the REST layer maps
  it to `502` rather than an opaque `500`.
- `createBuilder`/`removeBuilder`/`useBuilder` never pre-validate a name, driver or context against
  local state (e.g. whether a builder already belongs to another Docker context): the daemon's own
  refusal is the source of truth and is surfaced verbatim.

## Dependencies

- docker-access: CLI runner

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
