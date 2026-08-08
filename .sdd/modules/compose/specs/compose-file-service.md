---
module: compose
component: ComposeFileService
type: backend service
---

# ComposeFileService

**Purpose** → reads and validated-writes a project's own discovered compose file(s), and validates
them on demand — the single consumer of the batch-3 host-path validation service (REQ-116). No path
is ever accepted from the operator: every path handled here must already be one of the project's own
`configFiles`, as discovered by `ComposeDiscoveryService`.

## Contract

- `readComposeFiles(projectName): Promise<ComposeFileReadResult>`
  - `{ ok: true, files: { path, content }[] }` — one entry per discovered config file, in order.
  - `{ ok: false, reason }` — no compose file was discovered, or the first failing file's own
    host-path validation refusal (existence, kind, readability), stating that the path resolves on
    the machine running the server.
- `writeComposeFile(projectName, path, content): Promise<ComposeFileWriteResult>`
  - `{ ok: true }` on success; the file is overwritten verbatim with `content`.
  - `{ ok: false, reason }` when `path` is not one of the project's own discovered `configFiles`, or
    fails host-path validation (existence, kind, writability), or is reported not writable.
- `validateComposeFile(projectName): Promise<ComposeValidationResult>`
  - Resolves the project's own discovered file(s) through `docker compose config`.
  - `{ valid: true, errors: [], services, volumes, networks }` — the declared service/volume/network
    names — on success.
  - `{ valid: false, errors: [message], services: [], volumes: [], networks: [] }` — the daemon's own
    message — when the file(s) do not resolve.

## Dependencies

- compose: ComposeDiscoveryService (`getComposeProject`), the module-internal `compose-cli.ts` helper
- local-persistence: HostPathValidator (`validateHostPath`)

## Requirements served

- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-116
