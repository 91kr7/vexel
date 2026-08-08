---
module: image-analysis
component: LayerDuplicateDetection
type: backend utility
---

# LayerDuplicateDetection

**Purpose** → identifies file content still present, unchanged, at more than one path in an image's
final merged filesystem, wasting the bytes of every copy past the first (REQ-66).

## Contract

- `analyzeDuplicateContent(changesets: ImageChangesets): LayerDuplicateAnalysis`
  - `LayerDuplicateAnalysis`: `{ imageId, duplicates, totalDuplicateWastedBytes }`.
  - `DuplicateContentGroup`: `{ contentHash, sizeBytes, paths: { path, layerIndex }[], wastedBytes }`
    — `wastedBytes` = `(paths.length - 1) * sizeBytes`; sorted by `wastedBytes` descending.

## Rules and invariants

- Only a path's final, live content (its last timeline event, when not a deletion) is considered — a
  superseded occurrence is LayerWasteAnalysis's concern, never double-counted here.
- Zero-byte content is excluded: it wastes nothing regardless of how many paths share it.
- A hash held by a single live path is not reported.
- No I/O: pure computation, reusing `buildPathTimelines` from LayerWasteAnalysis.

## Dependencies

- image-analysis: ChangesetService (`ImageChangesets` type), LayerWasteAnalysis
  (`buildPathTimelines`)

## Requirements served

- plan-docker_management_app/REQ-66
