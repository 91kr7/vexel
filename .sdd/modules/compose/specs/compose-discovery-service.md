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
- `getComposeProject(name): Promise<ComposeProjectSummary>`
  - Re-reads a single project's own status (e.g. right after a lifecycle action).
- `ComposeProjectSummary`: `{ name, configFiles, state, services, error? }`
  - `configFiles: string[]` — the project's `ConfigFiles` label, comma-split; several entries when
    the project was brought up with several `-f` files.
  - `state: 'running' | 'partial' | 'stopped' | 'unknown'` — `'running'` when every service is
    running, `'stopped'` when none is, `'partial'` when mixed, `'unknown'` when the project's
    services could not be read (see `error`).
  - `services: ComposeServiceSummary[]` — `{ name, image, state, replicas }`; `replicas` is the
    number of container instances currently backing that service.
  - `error?: string` — the daemon's own message, set only when this project's services could not be
    read (`docker compose ps` failed for it); `state` is `'unknown'` in that case.

## Dependencies

- docker-access: CLI runner (`runCliCommand`, via the module-internal `compose-cli.ts` helper)

## Requirements served

- plan-docker_management_app/REQ-75
