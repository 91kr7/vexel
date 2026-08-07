---
module: images
component: Images endpoints
type: REST endpoint
---

# Images endpoints

**Purpose** → exposes `ImagesService` and `ImageTransferService` to the client.

## Contract

- `GET /api/images` → `200`, `ImageSummary[]` (see `images-service.md`).
- `GET /api/images/:id/inspect` → `200`, `ImageInspect` (see `images-service.md`).
- `GET /api/images/pull/stream?reference=...&platform=...` → the pull progress stream, as
  server-sent events: `step` (`ImageTransferStep`, see `image-transfer-service.md`), `error` (`{
  message }`), `end`.
- `GET /api/images/:id/push/stream?reference=...` → the push progress stream for `id`, pushing
  `reference` (defaults to `id` itself when omitted); same event shape as the pull stream.
- `GET /api/images/save?references=...&references=...&filename=...` → streams a tarball of the
  given references straight to the response as a browser download (REQ-42): `Content-Type:
  application/x-tar`, `Content-Disposition: attachment; filename="..."` (from `filename` when given,
  otherwise derived from the references). `400` with `{ error }` when `references` is empty.
- `POST /api/images/load` → the request body is the tarball to load, streamed straight into the
  Engine API (REQ-42); `200` with `{ references }` once the daemon reports completion, `4xx/5xx`
  with `{ error }` on a daemon refusal.
- `POST /api/images/:id/tag` → request body `{ reference }`; `400` with `{ error }` when `reference`
  is missing or blank; otherwise `204`.
- `DELETE /api/images/untag?reference=...` → `400` with `{ error }` when `reference` is missing or
  blank; otherwise `204`.
- `DELETE /api/images/:id` → force-removes the image; `204`.
- `POST /api/images/prune` → `200`, `{ removedCount: number, reclaimedBytes: number }`.

## Rules and invariants

- Any daemon rejection responds with the daemon's own `statusCode` (falling back to `502`) and `{
  error: message }` carrying the daemon's own message verbatim.
- The pull/push stream endpoints cancel the upstream Engine API stream as soon as the client
  disconnects; `save` and `load` do the same for their own Engine API stream.
- Neither `save` nor `load` ever buffers the tarball whole in memory or on disk.

## Dependencies

- ImagesService, ImageTransferService

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-40
- plan-docker_management_app/REQ-42
