---
module: compose
component: Compose endpoints
type: REST endpoint
---

# Compose endpoints

**Purpose** → exposes compose discovery, lifecycle, scaling, file read/write/validate and aggregated
log streaming to the client.

## Contract

- `GET /api/compose/projects` → every discovered `ComposeProjectSummary`.
- `POST /api/compose/projects/:name/up` → NDJSON stream: `{ type: 'output', line }*`, then exactly
  one `{ type: 'result', project }` or `{ type: 'error', message }`.
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

## Dependencies

- compose: ComposeDiscoveryService, ComposeLifecycleService, ComposeFileService, ComposeLogsService

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-78
- plan-docker_management_app/REQ-116
