---
module: image-analysis
component: LayerWasteAnalysis
type: backend utility
---

# LayerWasteAnalysis

**Purpose** → estimates, from an image's already-computed per-layer changesets, the bytes written by
one layer for a path that a later layer then overwrote or deleted — bytes still physically stored in
the image though invisible in its final merged filesystem (REQ-65).

## Contract

- `buildPathTimelines(changesets: ImageChangesets): Map<string, PathEvent[]>` — every path's
  added/modified/deleted events across the image's layers, in build order; `PathEvent`: `{
  layerIndex, status, sizeBytes?, contentHash? }`. Shared with LayerDuplicateDetection.
- `analyzeLayerWaste(changesets: ImageChangesets): LayerWasteAnalysis`
  - `LayerWasteAnalysis`: `{ imageId, wastedFiles, totalWastedBytes, totalBytesWritten,
    efficiencyScore }`.
  - `WastedFile`: `{ path, layerIndex, sizeBytes, supersededByLayerIndex, reason: 'overwritten' |
    'deleted' }` — `layerIndex` is the layer that wrote these now-dead bytes,
    `supersededByLayerIndex` the layer that overwrote or deleted that version; sorted by `sizeBytes`
    descending.
  - `efficiencyScore` = `1 - totalWastedBytes / totalBytesWritten`, bounded to `[0, 1]`; `1` when
    `totalBytesWritten` is `0`.

## Rules and invariants

- A path's every occurrence except its last is waste: the last is either the live content (still
  reachable in the final filesystem) or a deletion marker, which itself carries no bytes and is
  never counted as waste.
- No I/O: pure computation over an already-computed `ImageChangesets` (ChangesetService, batch 13).

## Dependencies

- image-analysis: ChangesetService (`ImageChangesets`, `LayerChangesetPath` types)

## Requirements served

- plan-docker_management_app/REQ-65
