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
    out; empty for a dangling (untagged) image. **Ordered lowest first** under the list-order rule,
    the repository compared before the tag, so `nginx:1.25` precedes `nginx:latest` and the order
    does not depend on the order the daemon returned `RepoTags` in.
  - `digest` — the first `RepoDigest` (a `repo@algorithm:hash` reference), with the `repo@` prefix
    dropped and the remaining `algorithm:hash` shortened to `algorithm:first-12-hex-chars`;
    `undefined` when the image has no digest (never pulled from/pushed to a registry).
  - `platforms` — `["os/architecture[/variant]"]`, resolved per image via its own inspect call;
    empty when the daemon does not report an OS/architecture for that image (an inspect failure for
    one image degrades to an empty platform list for it, not a failed listing).
    **Resolved once per image id** (plan-docker_management_app-refresh_cache/REQ-2): a later listing
    inspects only the ids whose platform is not known yet, and every row carries the same value it
    carries today (plan-docker_management_app-refresh_cache/REQ-3). Only a **resolved** platform is
    kept, so an image left empty — inspect failed, or the daemon reported no OS/architecture — is
    inspected again on the next listing instead of staying blank for the rest of the session.
  - `createdAt` — ISO-8601 instant.
  - **Ordered named-first, dangling last.**
    - a **tagged** image sorts by its **lowest tag** — the head of the ordered `tags` above, never
      the first tag the daemon returned — repository compared before tag, so every tag of one
      repository stays together;
    - an image with **no tag but a digest reference** (pulled by digest) sorts among the named ones,
      under the **repository** of that reference, read from the daemon's own `RepoDigests` (the
      emitted `digest` field has already dropped its repository) and taken as the lowest of them
      when there are several; it sorts before the tagged images of that same repository;
    - a **dangling** image (no tag and no digest reference) joins one block **after every named
      image**, **newest first** by `createdAt`, with the image's `id` as the final comparison — so
      two dangling images sharing a creation instant, which second-granular timestamps make
      ordinary, are still ordered identically on every read;
    - the emitted fields are unchanged by any of this: `digest` is still the first `RepoDigest`
      shortened, and a dangling image still carries an empty `tags`.
  - The same images produce the **same sequence on every read**, whatever order the daemon supplied
    them — or their `RepoTags` — in.
- `resetImagePlatformCache(): void` — discards the platforms remembered above, so the next listing
  resolves them again. It exists for the checks, which need to observe the resolving itself; the
  server never calls it.
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
- A reference is split into repository and tag at the last `:` that follows the last `/`, so a
  registry host carrying a port (`localhost:5000/nginx:1.25`) keeps its port in the repository.
- A platform kept against an image id stays valid for the process's lifetime and across a change of
  active context: the id is a content digest, and the same content has the same OS/architecture on
  any daemon.
- `getImageInspect` leaves its own `tags` exactly as the daemon returned them: the ordering above is
  a property of the list, which is where the row's sort key is defined.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`), DockerDaemonError
- list-order: List order (`byNameThenIdentity`, `byNamedThenUnnamedNewest`)

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-40
- plan-docker_management_app-list_ordering/REQ-17
- plan-docker_management_app-list_ordering/REQ-18
- plan-docker_management_app-list_ordering/REQ-19
- plan-docker_management_app-list_ordering/REQ-20
- plan-docker_management_app-list_ordering/REQ-21
- plan-docker_management_app-list_ordering/REQ-22
- plan-docker_management_app-refresh_cache/REQ-2
- plan-docker_management_app-refresh_cache/REQ-3
