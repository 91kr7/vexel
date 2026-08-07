---
module: containers
component: ContainerTransferService
type: backend service
---

# ContainerTransferService

**Purpose** → moves a container's filesystem to and from a tarball through the browser: export a
running or stopped container's current filesystem as a download, and import an image from an
uploaded filesystem tarball (the `docker export` / `docker import` pair) (REQ-43).

## Contract

- `openContainerExportStream(id, filenameHint?): Promise<{ response: IncomingMessage,
  suggestedFilename: string }>` — `GET /containers/{id}/export`; the caller pipes `response`'s raw
  bytes straight to the HTTP response as a download. `suggestedFilename` is `filenameHint` when
  given, otherwise `"<id (12 chars)>-filesystem"`, always sanitized through the images module's
  `sanitizeTarFilename`.
- `importFilesystemImage(body, targetReference?, changes?, handlers): Promise<() => void>` — `POST
  /images/create?fromSrc=-[&repo=...&tag=...][&changes=...]` with `body` (the raw upload request
  stream) piped straight into the request; `targetReference` names the resulting image (`repo:tag`,
  `latest` when the reference carries no tag), `changes` applies Dockerfile-style instructions (e.g.
  `CMD`, `ENV`) to the imported image, same as `docker import`.
- `handlers`: `{ onError(message), onEnd(result) }`; `result`: `{ id?, reference? }` — `id` is the
  daemon's own status line from the import (its resulting image id when it reported one), `reference`
  echoes `targetReference`.
- `importFilesystemImage` returns an idempotent cancel function that destroys the underlying streams.

## Rules and invariants

- Neither direction ever buffers the tarball whole: the Engine API response/request body is piped
  through as it arrives.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`)
- images: ImageTransferService (`splitReference`, `NdjsonDecoder`, `sanitizeTarFilename` reused)

## Requirements served

- plan-docker_management_app/REQ-43
