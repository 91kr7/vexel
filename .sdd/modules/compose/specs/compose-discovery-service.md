---
module: compose
component: ComposeDiscoveryService
type: backend service
---

# ComposeDiscoveryService

**Purpose** → discovers compose projects and their per-service state through the `docker compose`
CLI channel; the compose file path is never operator-typed, it comes straight from the daemon's own
`com.docker.compose.project.config_files` label as reported by `docker compose ls`.

## Contract

- `listComposeProjects(): Promise<ComposeProjectSummary[]>`
  - One entry per project known to `docker compose ls --all`.
  - **Ordered by project name** under the list-order rule (`compareNames`): `web-2` before `web-10`,
    `Api` next to `api-gateway` rather than in a second alphabet. A project carries no identifier
    other than its name, so the final comparison is **that same name compared exactly**, which
    separates two projects whose names differ only in case or in leading zeros (`app-1` from
    `app-01`).
  - The same projects produce the **same sequence on every read**, whatever order
    `docker compose ls` listed them in.
- `getComposeProject(name): Promise<ComposeProjectSummary>`
  - Re-reads a single project's own status (e.g. right after a lifecycle action).
- `ComposeProjectSummary`: `{ name, configFiles, state, services, error? }`
  - `configFiles: string[]` — the project's `ConfigFiles` label, comma-split; several entries when
    the project was brought up with several `-f` files.
  - `state: 'running' | 'partial' | 'stopped' | 'unknown'` — `'running'` when every service is
    running, `'stopped'` when none is, `'partial'` when mixed, `'unknown'` when the project's
    services could not be read (see `error`).
  - `services: ComposeServiceSummary[]` — `{ name, image, state, replicas }`; `replicas` is the
    number of container instances currently backing that service. **Ordered by service name** under
    the same rule, with that name compared exactly as the final comparison, and nested inside their
    project — in `getComposeProject` exactly as in `listComposeProjects`.
  - `error?: string` — the daemon's own message, set only when this project's services could not be
    read (`docker compose ps` failed for it); `state` is `'unknown'` in that case.

## Rules and invariants

- A non-zero exit or a spawn failure of the underlying CLI command rejects with a `DockerDaemonError`
  (`docker-access`, code `DaemonRejected`) carrying the daemon's own message, so the REST layer maps
  it to `502` rather than an opaque `500`.

## Dependencies

- docker-access: CLI runner (`runCliCommand`, via the module-internal `compose-cli.ts` helper)
- list-order: List order (`byNameThenIdentity`)

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app-list_ordering/REQ-35
- plan-docker_management_app-list_ordering/REQ-36
- plan-docker_management_app-list_ordering/REQ-43
