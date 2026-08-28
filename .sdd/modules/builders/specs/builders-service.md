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
  - **Ordered by builder name** under the list-order rule (`compareNames`). A builder carries no
    identifier other than its name, so the final comparison is **that same name compared exactly**,
    which separates two builders whose names differ only in case or in leading zeros.
  - The **active builder keeps its alphabetical place**: it is marked by `active`, never promoted.
  - The same builders produce the **same sequence on every read**, whatever order buildx listed
    them in.
- `builderListCache` — the refresh-cache kind the inventory is held under: key `builders`, period
  30 s, **no event type** — buildx publishes none, and the operations below say so themselves (see
  `refresh-cache.md`, module `refresh-cache`). `listBuilders` is its read; the inventory above is
  unchanged by this.
- `createBuilder(input): Promise<BuilderSummary>`
  - `input`: `{ name, driver, endpoint?, platforms: string[] }`.
  - Rejects with the daemon's own message on a name collision or an invalid driver/endpoint.
  - Resolves with the newly created builder's own summary.
- `removeBuilder(name): Promise<void>`
  - Rejects with the daemon's own message if the builder does not exist or refuses removal.
- `useBuilder(name): Promise<BuilderSummary>`
  - Sets `name` as the builder used by default; resolves with its resulting summary (now `active`).

## Rules and invariants

- `createBuilder`, `removeBuilder` and `useBuilder` say the inventory has changed once they have
  succeeded, so the operator's own action shows on the next request without waiting for a timer. A
  failed call marks nothing.

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
- list-order: List order (`byNameThenIdentity`)
- refresh-cache: Refresh cache (`registerRefreshKind`)

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app-list_ordering/REQ-11
- plan-docker_management_app-list_ordering/REQ-12
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-13
