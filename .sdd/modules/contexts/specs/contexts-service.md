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

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
