---
module: containers
component: Container create endpoint
type: REST endpoint
---

# Container create endpoint

**Purpose** → exposes container creation to the client, streaming the image pull progress and then
the outcome of the creation.

## Contract

- `POST /api/containers` → creates a container from the configuration in the request body
  - request: a `ContainerCreateSpec` as JSON (see `ContainerCreateService`).
  - `200` with `Content-Type: application/x-ndjson` → one JSON object per line:
    - `{ "type": "pull-step", "step": { id, status, currentBytes?, totalBytes? } }` — repeated,
      only when the image had to be pulled.
    - `{ "type": "image-resolved", "pulled": boolean }` — once the image is available locally.
    - `{ "type": "created", "result": { id, name, started, imagePulled, warnings } }` — terminal,
      on success.
    - `{ "type": "error", "message": "…" }` — terminal, carrying the daemon's own refusal message.

## Rules and invariants

- The stream always ends with exactly one `created` or `error` line, and the response is then
  closed.
- The HTTP status stays `200` even when the creation is refused: the refusal travels in the `error`
  line so the client can keep the operator's entered values instead of treating the whole request
  as failed.
- The response is newline-delimited JSON rather than server-sent events because the configuration
  is a request body — a browser can only open an event source with `GET`.

## Dependencies

- ContainerCreateService

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
- plan-docker_management_app/REQ-29
