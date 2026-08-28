---
module: contexts
component: Contexts endpoints
type: REST endpoint
---

# Contexts endpoints

**Purpose** → exposes the Docker context inventory, its management and the daemon information of the
active context to the client.

## Contract

- `GET /api/contexts` → the context inventory, **answered from the refresh cache**.
  - `200` → `ContextSummary[]`, every context whatever its endpoint kind.
- `GET /api/contexts/daemon-info` → the daemon of the active context (REQ-94).
  - `200` → `DaemonInfo`.
  - `502` → the daemon is unreachable or refused, with its own message.
- `POST /api/contexts` → creates a context.
  - request: `{ name, kind: 'local' | 'ssh', host?, description? }`.
  - `400` → `name` missing or blank.
  - `400` → `kind` absent or anything other than `local`/`ssh`, the message stating that a TCP+TLS
    context is created from the console and is then listed and usable like any other.
  - `400` → `kind` is `ssh` and `host` is missing or blank.
  - `201` → the created context.
- `POST /api/contexts/:name/use` → makes `:name` the active context (REQ-93).
  - `200` → the resulting context (now `active`).
- `DELETE /api/contexts/:name` → removes the context.
  - `204` → removed.
- Any Docker/CLI-side failure on the above → `502` (or the error's own status code) with
  `{ error: message }`, Docker's own message verbatim.

## Rules and invariants

- **`GET /api/contexts` never runs the CLI while the client waits.** It answers the value the
  refresh cache holds (kind `contexts`); only an inventory never read before — which a context
  switch makes the case again, since the switch discards every held value — waits for a read. The
  body is unchanged; the response carries `X-Vexel-Read-At`, `X-Vexel-Age-Ms`, and `X-Vexel-Stale`
  when the last read attempt failed.
- Create, select-active and remove mark that kind changed on success, through `ContextsService`.
  `GET /api/contexts/daemon-info` stays **direct**.

- `daemon-info` is matched before the `:name` routes, so the daemon reading can never be taken for a
  context named "daemon-info".

## Dependencies

- contexts: ContextsService, DaemonInfoService

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-94
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-13
- plan-docker_management_app-refresh_cache/REQ-16
