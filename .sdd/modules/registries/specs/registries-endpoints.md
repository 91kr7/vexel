---
module: registries
component: Registries endpoints
type: REST endpoint
---

# Registries endpoints

**Purpose** → exposes the registry inventory, log in / log out, and repository/tag browsing to the
client (REQ-85, REQ-86, REQ-87).

## Contract

- `GET /api/registries` → the configured registries, answered from the inventory the server holds
  - `200` → `RegistrySummary[]` (host, serverUrl, authenticated, account?, credentialStore?, secure,
    official) — never a credential; the body unchanged, plus the read-time headers every held value
    carries (`X-Vexel-Read-At`, `X-Vexel-Age-Ms`, and `X-Vexel-Stale` when the last read failed).
  - `502` → the inventory could not be read (message from the Docker channel), which only an
    inventory never read before can answer with: a read that fails while one is held keeps it and
    says so through the staleness header.
- `GET /api/registries/repositories?host=&query=&limit=` → repositories of a registry
  - `200` → `RepositorySummary[]` (`{ name, description?, pullCount? }`).
  - `400` → no `host`.
  - `502` → the registry refused, was unreachable, or requires credentials the application does not
    hold.
- `GET /api/registries/tags?host=&repository=&limit=` → tags of a repository
  - `200` → `TagSummary[]` (`{ name, sizeBytes?, updatedAt?, pullReference }`).
  - `400` → no `host`, or no `repository`.
  - `502` → as above.
- `POST /api/registries/login` → logs in to a registry
  - request: `{ host, username, secret }`.
  - `200` → the registry's resulting state (`RegistrySummary`), **without any credential**.
  - `400` → a missing or empty `host`, `username` or `secret`.
  - `502` → the registry refused the credential; the message never contains the secret.
- `POST /api/registries/logout` → drops the stored credential
  - request: `{ host }`.
  - `200` → the registry's resulting state.
  - `400` → a missing or empty `host`.
  - `502` → the logout was refused.

## Rules and invariants

- Login is the only endpoint that ever receives a secret, and it receives it in a request **body** —
  never in a URL, a query string or a path, which are the parts of a request that get logged
  (REQ-87).
- No endpoint here returns, echoes or logs a credential, in a success answer or in an error one.
- `limit` is clamped: absent, unparseable or non-positive falls back to 25, and it never exceeds
  100 — a browse can not be turned into an unbounded read of a registry.
- The browsing endpoints take the host as a query parameter rather than a path segment: a registry
  host carries a port (`registry.internal:5000`), which has no unambiguous place in a path.
- Only the inventory is held. Log in, log out and the repository/tag browsing read directly, as they
  do today: each answers for one registry, right after — or about — an action, and no held value may
  stand between them and the installation.

## Dependencies

- registries: RegistriesService, RegistryCatalogService
- refresh-cache: Held value response
- docker-access: typed daemon error (status mapping)

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-87
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-54
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-60
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-61
