---
module: contexts
component: ContextsService
type: backend service
---

# ContextsService

**Purpose** → the Docker context inventory of the local installation and its management: which
contexts exist, with what endpoint, which one is active, plus create (local socket and SSH kinds),
select-active and remove — through the CLI channel, the only owner of the local Docker
configuration.

## Contract

- `listContexts(): Promise<ContextSummary[]>`
  - `ContextSummary`: `{ name, description?, endpoint, kind, tls, active, error? }`.
  - `endpoint` is the endpoint URL exactly as Docker records it (`unix:///…`, `ssh://…`,
    `tcp://…`); `""` when the context records none.
  - `kind` is derived from that URL: `ssh` for `ssh://`, `tcp` for `tcp://`/`http://`/`https://`,
    `local` for anything else (`unix://`, `npipe://`).
  - `tls` is `true` when the context carries TLS material for its Docker endpoint.
  - `active` marks the one context Docker currently has selected; at most one is `active`.
  - `error` carries Docker's own message for a context it could not read; the context is still
    listed.
  - Every context is listed **whatever its endpoint kind** — a TCP+TLS one created outside the
    application included: none is filtered out, and none is marked unsupported.
  - **Ordered by context name** under the list-order rule (`compareNames`). A context carries no
    identifier other than its name, so the final comparison is **that same name compared exactly**,
    which separates two contexts whose names differ only in case or in leading zeros.
  - The **active context keeps its alphabetical place**: it is marked by `active`, never promoted.
  - The same contexts produce the **same sequence on every read**, whatever order Docker listed
    them in.
- `contextListCache` — the refresh-cache kind the inventory is held under: key `contexts`, period
  5 minutes, **no event type** — a context changes only when the operator changes one, and the
  operations below say so themselves (see `refresh-cache.md`, module `refresh-cache`).
  `listContexts` is its read; the inventory above is unchanged by this.
- `createContext(input): Promise<ContextSummary>`
  - `input`: `{ name, kind: 'local' | 'ssh', host?, description? }`.
  - `local` → the endpoint is the default Docker socket of the machine running the server; the
    operator supplies no path.
  - `ssh` → the endpoint is `ssh://<host>`, the destination as typed (`user@host`), an
    `ssh://` prefix the operator typed being accepted and not doubled.
  - Rejects with Docker's own message on a name collision or a refused endpoint.
  - Resolves with the created context's own summary.
- `activateContext(name): Promise<ContextSummary>`
  - Makes `name` the active context in the local Docker configuration, then publishes its resolved
    endpoint to the Docker access layer, so the Engine API client and the daemon event stream
    re-establish against that daemon (REQ-93).
  - Resolves with the resulting summary (now `active`).
  - A TCP+TLS context is activated like any other: its TLS material, stored by Docker itself, is
    resolved and dialed.
- `removeContext(name): Promise<void>`
  - Rejects with Docker's own message when the context cannot be removed (e.g. it is the current
    one, or it is `default`).
- `publishActiveEndpoint(): Promise<void>`
  - Points the Docker access layer at the currently active context. Called at startup and after a
    change to the inventory.
  - Never rejects: when the contexts cannot be read at all (no `docker` CLI, unreadable
    configuration), the access layer keeps the endpoint it already had.

## Rules and invariants

- `createContext`, `activateContext` and `removeContext` say the inventory has changed once they
  have succeeded. `activateContext` marks it **after** publishing the new endpoint, so the discard
  that switch triggers cannot undo the mark.
- This inventory is also what reports **which** context is active, so a switch discards it like
  every other held value: the next request reads it again with the client waiting. The interface is
  never left without an answer, and is never shown the answer of the context left behind.
- `listContexts` is still called directly where the answer must not come from a held value: the
  endpoint resolution behind `publishActiveEndpoint`, and the single-context lookup the three
  operations above return.

- Creation covers the local-socket and SSH kinds only. A TCP+TLS context needs three certificate
  files on the *server's* filesystem, which the operator cannot see; its creation was withdrawn
  (departure Three, 2026-08-07) and is console-only. **This restricts creation, not support**: such
  a context is listed, selectable and dialed like any other.
- No form of a context is ever pre-validated against local state: Docker's own refusal is the source
  of truth and is surfaced verbatim.
- A non-zero exit or a spawn failure of the underlying CLI command rejects with a `DockerDaemonError`
  (`docker-access`, code `DaemonRejected`) carrying Docker's own message, so the REST layer maps it
  to `502` rather than an opaque `500`.
- The TLS material of a context is read from Docker's own storage for that context; when it cannot
  be read, the inventory is still returned, with `tls` false — the list is worth more than the
  detail it adds.

## Dependencies

- docker-access: CLI runner, Active endpoint
- list-order: List order (`byNameThenIdentity`)
- refresh-cache: Refresh cache (`registerRefreshKind`)

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-docker_management_app-list_ordering/REQ-10
- plan-docker_management_app-list_ordering/REQ-12
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-13
- plan-docker_management_app-refresh_cache/REQ-16
