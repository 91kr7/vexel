---
module: image-analysis
component: FilesystemExtractionService
type: backend service
---

# FilesystemExtractionService

**Purpose** → browses any image's fully merged, post-union filesystem without ever running it: a
container is created from the image and never started, its filesystem is exported and indexed into
a flat entry list, and the container is removed whatever happens — identically for a
shell-bearing image and a distroless/scratch one, since nothing from the image is ever executed
(REQ-52, REQ-53, REQ-56). Reports progress, is cancellable, and its result is served from the
analysis cache across restarts when the image content is unchanged (REQ-113).

## Contract

- `extractImageFilesystem(imageId, options, handlers): Promise<() => void>`
  - `options`: `{ force?: boolean }` — `force` invalidates any cached entry first, always
    recomputing (the re-extract action).
  - `handlers`: `{ onProgress(progress), onError(message), onEnd(result) }`.
  - `FilesystemExtractionProgress`: `{ phase: 'creating' } | { phase: 'copying' } | { phase:
    'indexing' }` — creating the intermediate container, streaming its export to temporary disk,
    then reading it into the flat entry list.
  - `onEnd(result)`: `FilesystemExtractionResult`: `{ imageId, entryCount, fromCache, refusedCount
    }` — `refusedCount` is how many tar entries INT-7's containment check excluded (REQ-62).
  - Returns a cancel function; calling it stops the run at its next await point, no further handler
    fires, and the intermediate container is still removed.
- `listImageFilesystemChildren(imageId, parentPath?): Promise<FilesystemEntry[] | undefined>` —
  direct children of `parentPath` (default the root) from a previously extracted, still-cached
  filesystem; `undefined` when this image has no cached extraction (the caller must extract first).
  One directory level per call — designed for lazy expansion of a large tree.
  - `FilesystemEntry`: `{ path, name, kind: 'file' | 'directory' | 'symlink', sizeBytes?, mode?,
    uid?, gid?, mtimeMs?, linkTarget? }` — `sizeBytes` only for a `file`; `mode`/`uid`/`gid`/
    `mtimeMs` are the tar header's own POSIX metadata when present (REQ-58); `linkTarget` only for a
    `symlink`, `FilesystemContainment.resolveSymlinkTarget`'s resolved, tree-root-relative value —
    never the tar header's own raw target text, which may be absolute or carry a `..` chain (REQ-58,
    REQ-62). A symlink whose target cannot be resolved this way is excluded entirely (see
    `refusals` below), never indexed with an unresolved or partially-resolved target.
- `getExtractedFilesystem(imageId): Promise<ImageFilesystem | undefined>` — the full previously
  extracted, still-cached filesystem (`{ imageId, entries, refusals }`); the shared read path
  `FilesystemEntryService`, `FilesystemContentService`, `FilesystemSearchService` and
  `FilesystemExportService` build on. `refusals`: `{ path, reason }[]`, the entries INT-7 excluded.
- `getExtractedArchivePath(imageId): string | undefined` — filesystem path to this image's cached
  raw export tarball, read back by `FilesystemContentService` and `FilesystemExportService` without
  re-extracting; `undefined` when not cached (e.g. an extraction performed before this cache was
  introduced — the caller asks the operator to re-extract).
- `normalizePath(path)`, `parentOf(path)` — the path-normalization helpers shared with the other
  filesystem services, so every one of them treats a path identically.
- `sweepAbandonedExtractionContainers(): Promise<void>` — removes every container carrying the
  intermediate-extraction label, regardless of the image it was created from; called once at server
  startup to clean up after an interrupted run (REQ-54, REQ-57).
- `INTERNAL_CONTAINER_LABEL` — the label (`vexel.internal-container=true`) every intermediate
  extraction container carries, so no other surface of the application ever lists it or counts it
  (REQ-54); consumed by the containers module to exclude it from `listContainers`.

## Rules and invariants

- The intermediate container is created (`POST /containers/create`, never `/start`) and force-removed
  in a `finally` block covering the whole run: it is removed on success, on any error, and on
  cancellation, with no code path that skips it (REQ-54).
- That removal takes the container's **anonymous volumes with it**. The daemon attaches one to every
  `VOLUME` the image declares, and a removal that leaves them behind orphans one volume per
  extraction of such an image (`registry:2` and anything derived from it, for instance) on the
  operator's own host — carrying no label, so nothing can identify it afterwards. Nothing of the
  operator's is at stake: these volumes are created by, and only ever belong to, a container this
  service made and never started. The same holds for the startup sweep of containers left by an
  interrupted run.
- A prior result for the image's content digest (looked up in the analysis cache under a key
  distinct from the changeset cache's, since both artifact kinds are computed for the same image id
  but the cache holds one artifact per key) short-circuits straight to `onEnd` with `fromCache:
  true`, creating no container and reading no export.
- The exported tarball is written to a per-run temporary directory and read once, entry by entry
  (never buffered whole); the directory is removed once the run ends, cancels or fails.
- A successful, non-cached run's result is inserted into the analysis cache before `onEnd` fires,
  together with the raw export tarball itself, under a distinct cache key, kept so entry content and
  subtree archives can be read back later without re-extracting (REQ-59, REQ-61); `force` invalidates
  both.
- Every tar entry's own name, and every symlink entry's own target text, is validated against the
  tree before being indexed (via `FilesystemContainment`): one that attempts to leave it (an absolute
  path or a `../` segment) is excluded from `entries` and appended to `refusals` with its reason
  instead, and is never followed (REQ-62).
- `onError` and `onEnd` are mutually exclusive and each fires at most once per call.
- Extraction never starts the intermediate container and never mutates the source image, its tags,
  or any pre-existing container (REQ-53, REQ-56).
- The intermediate container is always created with a fixed, non-executable placeholder
  `Entrypoint`, regardless of what the image itself declares: the Engine API refuses `POST
  /containers/create` with "no command specified" for an image that declares neither `Cmd` nor
  `Entrypoint` (the literal `scratch`/distroless case REQ-52 names), and the placeholder is never
  run (REQ-53) and never affects the exported content, which is read from the image's own merged
  filesystem, not from the container's runtime config.
- The exported filesystem includes the daemon's own container-creation scaffolding (e.g.
  `.dockerenv`, `dev/`, `etc/hostname`, `etc/hosts`, `etc/mtab`, `etc/resolv.conf`, `proc/`, `sys/`),
  written into the union mount when any container is created regardless of what the image itself
  ships — an unavoidable consequence of the create-and-export technique REQ-53 mandates, not image
  content. Neither `extractImageFilesystem` nor `listImageFilesystemChildren` filters these entries
  out: doing so would also hide genuine content for an image that really does ship its own
  `/etc/hosts` or `/dev` tree, so they are surfaced as-is and the caller states their origin instead
  (REQ-52).

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`)
- image-analysis: the tar reader (internal), FilesystemContainment
- local-persistence: AnalysisCacheStore (`lookup`, `insert`, `invalidate`), LocalStore (`cacheDir`)

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-53
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-55
- plan-docker_management_app/REQ-56
- plan-docker_management_app/REQ-57
- plan-docker_management_app/REQ-58
- plan-docker_management_app/REQ-62
- plan-docker_management_app/REQ-113
