---
module: compose
component: Compose endpoints
type: REST endpoint
---

# Compose endpoints

**Purpose** → exposes compose discovery, lifecycle, scaling, file read/write/validate and aggregated
log streaming to the client.

## Contract

- `GET /api/compose/projects` → every discovered `ComposeProjectSummary`, **answered from the
  refresh cache**.
- `POST /api/compose/projects/:name/up` → NDJSON stream: `{ type: 'output', line }*`, then exactly
  one `{ type: 'result', project }` or `{ type: 'error', message }`. Closing the connection cancels
  the compose process.
- `POST /api/compose/projects/:name/down` → same shape as `up`.
- `POST /api/compose/projects/:name/restart` → same shape as `up`.
- `POST /api/compose/projects/:name/services/:service/scale` — body `{ replicas: number }`
  (non-negative) → same NDJSON shape as `up`; `400` when `replicas` is missing or negative.
- `GET /api/compose/projects/:name/files` → `ComposeFileReadResult` (`{ ok, files }` or
  `{ ok: false, reason }`), always `200`.
- `POST /api/compose/projects/:name/files` — body `{ path: string, content: string }` →
  `ComposeFileWriteResult`, always `200`; `400` when `path`/`content` are missing.
- `POST /api/compose/projects/:name/validate` → `ComposeValidationResult`, always `200`.
- `GET /api/compose/projects/:name/logs/stream` → server-sent events: `line` (`ComposeLogLine`),
  terminal `end` or `error` (`{ message }`); closes when the client disconnects.
- Any daemon-level failure the CLI reports (e.g. the project cannot be resolved) yields `502`
  `{ error }` on the plain JSON endpoints; the streaming endpoints instead carry it in their own
  terminal `error` event, HTTP status staying `200`.

## Rules and invariants

- **`GET /api/compose/projects` never runs the CLI while the client waits.** It answers the value
  the refresh cache holds (kind `compose-projects`); only a discovery never read before waits for a
  read. The body is unchanged; the response carries `X-Vexel-Read-At`, `X-Vexel-Age-Ms`, and
  `X-Vexel-Stale` when the last read attempt failed.
- Up, down, restart and scale mark that kind changed on success, through
  `ComposeLifecycleService`. File read and write, validation and log streaming stay **direct**.

- A client that disconnects mid-run leaves no compose process behind: up, down, restart and scale
  kill the running `docker compose`, and the cli-plugin under it, as soon as the connection goes
  away — including a disconnect during the CLI's own startup.
- A disconnect that lands earlier still, while the project these four resolve first is still being
  looked up, stops the command from starting at all: nothing runs on behalf of a client that has
  already gone. The state of the stack is then whatever it was — a cancelled run is a run that
  stopped where it stood, not one that is undone.
- Those four are cancelled on the **response** closing, not the request. A request that carries a
  body emits its close as soon as that body has been read, which for `scale` — the only one of the
  four the client sends with a JSON body — is before the project lookup the run is awaited behind
  has settled: bound to the request, the cancel was attached after the event and never fired. The
  other three are sent without a body, so nothing reads one and their request stayed open; they are
  bound to the response all the same, because which of them carries a body is the client's choice,
  not a property of the contract.

## Dependencies

- compose: ComposeDiscoveryService, ComposeLifecycleService, ComposeFileService, ComposeLogsService

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-78
- plan-docker_management_app/REQ-116
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-12
- plan-docker_management_app-refresh_cache/REQ-13
