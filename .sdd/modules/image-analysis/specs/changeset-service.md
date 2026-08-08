---
module: image-analysis
component: ChangesetService
type: backend service
---

# ChangesetService

**Purpose** → computes, for every layer of an image, the paths it alone added, modified or deleted
— not the cumulative merged state — by reading the image's own exported content rather than
`docker history`, honouring OCI whiteout markers (REQ-49); reports progress and is cancellable, and
warns the caller of a real temporary-disk cost since the image is exported to disk to be read
(REQ-51).

## Contract

- `computeImageChangesets(imageId, handlers): Promise<() => void>`
  - `handlers`: `{ onProgress(progress), onError(message), onEnd(result) }`.
  - `ChangesetProgress`: `{ phase: 'exporting' } | { phase: 'analyzing', completedLayers,
    totalLayers }` — `'exporting'` once while the image tarball is being written to temporary disk,
    then one `'analyzing'` call per layer finished.
  - `onEnd(result)`: `ImageChangesets`: `{ imageId, layers }`; `LayerChangeset`: `{ layerIndex,
    diffId?, paths }`; `LayerChangesetPath`: `{ path, status: 'added' | 'modified' | 'deleted',
    sizeBytes?, sizeUnavailableReason? }`.
  - A path already seen in an earlier (lower) layer is `'modified'`, otherwise `'added'`; an OCI
    whiteout marker (`.wh.<name>`) yields a `'deleted'` entry for `<name>` in the marker's directory,
    and an opaque-directory marker (`.wh..wh..opq`) yields a single `'deleted'` entry for the
    directory itself, hiding everything a lower layer put there. Neither carries a `sizeBytes`
    (nothing to size), only `sizeUnavailableReason`.
  - Returns a cancel function; calling it stops export/analysis at the next await point and no
    further handler fires.
- `computeLayerChangesetPaths(entries, knownPaths): LayerChangesetPath[]` — the pure computation
  above, exposed separately from reading the export: `entries: { name, size, typeFlag }[]` (a
  layer's raw tar entries, in archive order); `knownPaths: Set<string>` carries the paths already
  known from lower layers in and is updated in place with this layer's effect, ready for the next
  layer's call. No I/O; usable directly with a synthetic entry list (e.g. to exercise the opaque
  whiteout case without a real image producing one).

## Rules and invariants

- A prior result for `imageId` (looked up in the analysis cache by the image's own id, already a
  content digest) short-circuits straight to `onEnd`, with no export, no progress events, and a
  cancel that is a no-op once resolved.
- The image tarball is written to a per-run temporary directory, read layer by layer (never the
  whole tarball in memory), and removed once the run ends, cancels or fails.
- A layer's own content, once located inside the export, is decompressed on the fly when it is
  itself gzip-compressed (sniffed from its first two bytes) and read as-is otherwise: both shapes
  occur across image stores (verified against a running daemon — the containerd/Docker-Desktop image
  store gzips layer blobs even inside an otherwise uncompressed `docker save` export), and neither is
  assumed.
- Content that is neither a valid tar nor gzip-compressed one fails the run with `onError` — a
  changeset that cannot be computed is never delivered as an empty or garbage result.
- A successful, non-cached run's result is inserted into the analysis cache before `onEnd` fires.
- `onError` and `onEnd` are mutually exclusive and each fires at most once per call.

## Dependencies

- images: ImageTransferService (`openImageSaveStream`)
- image-analysis: LayerMetadataService (`getImageLayerStack`), the tar reader (internal)
- local-persistence: AnalysisCacheStore (`lookup`, `insert`), LocalStore (`cacheDir`)

## Requirements served

- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-51
