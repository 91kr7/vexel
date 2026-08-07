---
module: images
component: ImageTransferService
type: backend service
---

# ImageTransferService

**Purpose** → runs the registry-facing operations on local images: pull and push (both with
per-layer progress), tag, untag, remove and prune of dangling images.

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
    or the stream itself errors.
  - `onEnd` fires once the daemon closes the stream without an error.
- `tagImage(id, newReference): Promise<void>` — `POST /images/{id}/tag?repo=...&tag=...`.
- `untagImage(tagReference): Promise<void>` — `DELETE /images/{tagReference}`; removes just that tag
  reference, leaving the underlying image (and its other tags, if any) in place.
- `removeImage(id): Promise<void>` — `DELETE /images/{id}?force=true`.
- `pruneDanglingImages(): Promise<PruneResult>` — `POST /images/prune?filters={"dangling":["true"]}`;
  `PruneResult`: `{ removedIds: string[], reclaimedBytes: number }`.

## Rules and invariants

- Pull/push progress is decoded from the daemon's newline-delimited JSON stream, one `onStep`/
  `onError` call per line; a malformed/partial line is skipped rather than failing the transfer.
- The cancel function returned by `pullImage`/`pushImage` is idempotent and destroys the underlying
  HTTP stream; no further `onStep`/`onError`/`onEnd` calls follow it.
- Every non-streaming call rejects with a `DockerDaemonError` carrying the daemon's own message on
  failure.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
