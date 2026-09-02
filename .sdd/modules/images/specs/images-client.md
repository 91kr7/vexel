---
module: images
component: Images client
type: frontend data client
---

# Images client

**Purpose** → typed `fetch` wrapper for the images endpoints; the only place in the client that
knows their URLs.

## Contract

- `ImageSummary`, `ImageHistoryEntry`, `ImageInspect`, `PruneResult` — mirror the server shapes (see
  `images-service.md`, `image-transfer-service.md`).
- `fetchImageInspect(id): Promise<ImageInspect>` — `GET /api/images/:id/inspect`.
- `imagePullStreamUrl(reference, platform?): string` — `/api/images/pull/stream?reference=...
  [&platform=...]`.
- `imagePushStreamUrl(id, reference?): string` — `/api/images/:id/push/stream[?reference=...]`.
- `saveImagesUrl(references, filename?): string` — `/api/images/save?references=...[&filename=...]`
  (REQ-42); triggered with `triggerDownload` (ui-library), the browser handling the download itself.
- `IMAGE_LOAD_URL` — `/api/images/load` (REQ-42); the `POST` upload target consumed with
  `useFileUpload`.
- `tagImage(id, reference): Promise<void>` — `POST /api/images/:id/tag`.
- `untagImage(reference): Promise<void>` — `DELETE /api/images/untag?reference=...`.
- `removeImage(id): Promise<void>` — `DELETE /api/images/:id`.
- `pruneDanglingImages(): Promise<PruneResult>` — `POST /api/images/prune`.

## Rules and invariants

- Every function throws an `Error` whose message is the server's `{ error }` body when the response
  is not `ok` (the daemon's own message, per `images-endpoints.md`), falling back to a generic
  `HTTP <status>` message when the body carries none.

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-40
- plan-docker_management_app/REQ-42
