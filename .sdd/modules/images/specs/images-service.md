---
module: images
component: ImagesService
type: backend service
---

# ImagesService

**Purpose** → talks to the Docker Engine API to list local images and read an image's full inspect
data.

## Contract

- `listImages(): Promise<ImageSummary[]>` — every non-intermediate image via `GET
  /images/json?all=false`.
  - `ImageSummary`: `{ id, shortId, tags, digest?, platforms, sizeBytes, createdAt }`.
  - `tags` — the image's `repository:tag` references, with the daemon's `<none>:<none>` filtered
    out; empty for a dangling (untagged) image.
  - `digest` — the first `RepoDigest` (a `repo@algorithm:hash` reference), with the `repo@` prefix
    dropped and the remaining `algorithm:hash` shortened to `algorithm:first-12-hex-chars`;
    `undefined` when the image has no digest (never pulled from/pushed to a registry).
  - `platforms` — `["os/architecture[/variant]"]`, resolved per image via its own inspect call;
    empty when the daemon does not report an OS/architecture for that image (an inspect failure for
    one image degrades to an empty platform list for it, not a failed listing).
  - `createdAt` — ISO-8601 instant.
- `getImageInspect(id): Promise<ImageInspect>` — via `GET /images/{id}/json` plus `GET
  /images/{id}/history` (REQ-40).
  - `ImageInspect`: `{ id, tags, digest?, platforms, sizeBytes, createdAt, entrypoint, command, env,
    labels, exposedPorts, history, raw }`.
  - `entrypoint`/`command` — the image's `Entrypoint`/`Cmd`, empty array when unset.
  - `exposedPorts` — the keys of `Config.ExposedPorts` (e.g. `"80/tcp"`).
  - `history`: `{ createdAt, createdBy, sizeBytes, comment?, emptyLayer }[]` — one entry per
    recorded build step, exactly as the daemon returns it (verified against a running daemon: newest
    layer first, not reordered here); `emptyLayer` is `true` when the step added no data
    (`sizeBytes === 0`).
  - `raw` — the full inspect payload exactly as received, unmodified.

## Rules and invariants

- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure.
- `tags` never contains the daemon's dangling-image placeholder (`<none>:<none>`).

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-40
