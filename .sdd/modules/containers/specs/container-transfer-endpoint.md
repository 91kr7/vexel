---
module: containers
component: Container transfer endpoints
type: REST endpoint
---

# Container transfer endpoints

**Purpose** → exposes `ContainerTransferService` to the client.

## Contract

- `GET /api/containers/:id/export?filename=...` → streams `id`'s current filesystem straight to the
  response as a browser download (REQ-43): `Content-Type: application/x-tar`,
  `Content-Disposition: attachment; filename="..."` (from `filename` when given, otherwise derived
  from the container id).
- `POST /api/containers/import?targetReference=...&changes=...&changes=...` → the request body is
  the filesystem tarball to import, streamed straight into the Engine API (REQ-43); `200` with `{
  id?, reference? }` once the daemon reports completion, `4xx/5xx` with `{ error }` on a daemon
  refusal. Registered ahead of `/:id/inspect` so `"import"` is never read as a container id.

## Rules and invariants

- Any daemon rejection reaches the client through the response body's `{ error }` message.
- Both endpoints cancel the upstream Engine API stream as soon as the client disconnects.
- Neither endpoint ever buffers the tarball whole in memory or on disk.

## Dependencies

- ContainerTransferService

## Requirements served

- plan-docker_management_app/REQ-43
