---
module: registries
component: Registries endpoints
type: REST endpoint
---

# Registries endpoints

**Purpose** → exposes the registry inventory, log in / log out, and repository/tag browsing to the
client (REQ-85, REQ-86, REQ-87).

## Contract

- `GET /api/registries` → the configured registries
  - `200` → `RegistrySummary[]` (host, serverUrl, authenticated, account?, credentialStore?, secure,
    official) — never a credential.
  - `502` → the inventory could not be read (message from the Docker channel).
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

## Dependencies

- registries: RegistriesService, RegistryCatalogService
- docker-access: typed daemon error (status mapping)

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-87
