---
module: registries
component: Registries client
type: frontend data client
---

# Registries client

**Purpose** → the typed `fetch` wrapper over the registry endpoints (REQ-85, REQ-86, REQ-87).

## Contract

- `fetchRegistries(): Promise<RegistrySummary[]>` — the configured registries.
- `fetchRepositories(host, query, limit?): Promise<RepositorySummary[]>`.
- `fetchRepositoryTags(host, repository, limit?): Promise<TagSummary[]>`.
- `loginToRegistry({ host, username, secret }): Promise<RegistrySummary>` — sends the secret once,
  in the request body, and resolves with the registry's resulting state.
- `logoutFromRegistry(host): Promise<RegistrySummary>`.
- Every function rejects with an `Error` carrying the server's own `error` message, or
  `Request failed with HTTP <status>` when the answer has no such body.

## Rules and invariants

- **Nothing here stores, caches or returns a secret** (REQ-87): the secret is an argument of one
  call, sent once, and no module-level state keeps a reference to it.
- The types mirror the endpoints' payloads exactly; no field is invented, renamed or defaulted here.

## Dependencies

- registries: Registries endpoints

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-87
