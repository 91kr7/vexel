---
module: images
component: ImageTransferService
type: backend service
---

# ImageTransferService

**Purpose** → runs the registry-facing operations on local images: pull and push (both with
per-layer progress), tag, untag, remove and prune of dangling images; also opens/consumes the
browser-facing save/load tarball streams (REQ-42).

## Contract

- `pullImage(reference, platform, handlers): Promise<() => void>` — `POST
  /images/create?fromImage=...&tag=...[&platform=...]`; returns a cancel function that destroys the
  underlying stream.
  - `reference` — `repo`, `repo:tag` or `repo@digest`; defaults to tag `latest` when neither a tag
    nor a digest is given.
  - `platform` — optional `os/arch[/variant]`; omitted from the request when blank.
- `pushImage(reference, handlers): Promise<() => void>` — `POST
  /images/{repo}/push?tag=...`, with an anonymous `X-Registry-Auth` header (real per-registry
  credentials are a later batch's Registries feature).
- `handlers`: `{ onStep(step), onError(message), onEnd() }`.
  - `ImageTransferStep`: `{ id, status, currentBytes?, totalBytes? }` — one call per progress line
    the daemon emits; `id` is the layer id, or `"overall"` for a summary line; `currentBytes`/
    `totalBytes` come from the daemon's `progressDetail` when present.
  - `onError` fires (and no further steps follow) when the daemon reports `{ error }` on the stream,
    carrying that message verbatim; when the stream itself errors; and when the stream ends without
    the daemon having stated a success, carrying the last message the daemon gave.
  - `onEnd` fires only once the daemon has stated a success and then closed the stream.
- `openImageSaveStream(references, filenameHint?): Promise<{ response: IncomingMessage,
  suggestedFilename: string }>` — `GET /images/get?names=...` (repeated for each reference); the
  caller pipes `response`'s raw bytes straight to the HTTP response as a download (REQ-42).
  `suggestedFilename` is `filenameHint` when given, otherwise the sole reference or
  `"<count>-images"`, always sanitized through `sanitizeTarFilename`.
- `loadImages(body, handlers): Promise<() => void>` — `POST /images/load` with `body` (the raw
  upload request stream) piped straight into the request (REQ-42); returns a cancel function.
  - `handlers`: `{ onError(message), onEnd(result) }`; `result`: `{ references: string[] }` parsed
    from the daemon's own "Loaded image: …" status lines.
- `sanitizeTarFilename(hint): string` — strips a trailing `.tar`, replaces every character outside
  `[a-zA-Z0-9._-]` with `_`, and appends `.tar`; falls back to `"download.tar"` for an empty hint.
- `tagImage(id, newReference): Promise<void>` — `POST /images/{id}/tag?repo=...&tag=...`.
- `untagImage(tagReference): Promise<void>` — `DELETE /images/{tagReference}`; removes just that tag
  reference, leaving the underlying image (and its other tags, if any) in place.
- `removeImage(id): Promise<void>` — `DELETE /images/{id}?force=true`.
- `pruneDanglingImages(): Promise<PruneResult>` — `POST /images/prune?filters={"dangling":["true"]}`;
  `PruneResult`: `{ removedIds: string[], reclaimedBytes: number }`.

## Rules and invariants

- **Every operation here that changes the image listing says so** to the refresh cache once it has
  succeeded (`imageListCache.markChanged()`, module `refresh-cache`): pull and push when their
  stream has ended on a success, tag, untag, remove, prune and load when their call has returned.
  Marking is done here rather than in the endpoints because every caller of these operations must
  mark, and only one place can guarantee that. A failed operation marks nothing.
- `openImageSaveStream` and `sanitizeTarFilename` change nothing and mark nothing.

- Pull/push progress is decoded from the daemon's newline-delimited JSON stream, one `onStep`/
  `onError` call per line; a malformed/partial line is skipped rather than failing the transfer.
- A pull or push outcome is **stated, never inferred**: success is concluded only from a success the
  daemon declared, never from the absence of an error, so an end without one is a failure and no
  transfer is left apparently running once the stream has ended. The daemon states a success with
  - a push status naming the digest and size it stored — `<tag>: digest: sha256:… size: <n>` — or a
    push `aux` carrying a `Digest`;
  - a pull status line opening with `Status:` — "Downloaded newer image for …", "Image is up to date
    for …".
- The failure reported for an unstated end carries the last message the daemon gave (its last status
  line, or the error the stream itself raised); when it gave none, a message saying the transfer
  ended without a result.
- No deadline of the service's own is ever imposed on a transfer — no timer, no watchdog, no
  "nothing arrived in N seconds": it waits exactly as long as the daemon does.
- The cancel function returned by `pullImage`/`pushImage`/`loadImages` is idempotent and destroys
  the underlying HTTP stream(s); no further handler calls follow it.
- Neither `openImageSaveStream` nor `loadImages` ever buffers the tarball whole: the Engine API
  response/request body is piped through as it arrives.
- Every non-streaming call rejects with a `DockerDaemonError` carrying the daemon's own message on
  failure.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError
- images: ImagesService (`imageListCache`)

## Requirements served

- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-42
- plan-docker_management_app-push_failure_reporting/REQ-1
- plan-docker_management_app-push_failure_reporting/REQ-2
- plan-docker_management_app-push_failure_reporting/REQ-3
- plan-docker_management_app-push_failure_reporting/REQ-5
- plan-docker_management_app-push_failure_reporting/REQ-6
- plan-docker_management_app-refresh_cache/REQ-13
