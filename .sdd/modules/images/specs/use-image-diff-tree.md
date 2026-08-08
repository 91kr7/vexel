---
module: images
component: useImageDiffTree
type: frontend hook
---

# useImageDiffTree

**Purpose** → lazy per-directory queries over the last compared diff tree for a pair of images, so
a large diff is read one directory level at a time rather than fetched whole (REQ-63).

## Contract

- `useImageDiffTree(imageIdA: string | undefined, imageIdB: string | undefined): {
  childrenByPath, loadingPaths, errorsByPath, loadChildren, reset }`
  - `childrenByPath: Map<string, ImageDiffEntry[]>` — loaded children keyed by parent path (`''`
    for the root); absent means not requested yet.
  - `loadingPaths: Set<string>` — paths currently being read.
  - `errorsByPath: Map<string, string>` — the last read failure's message per path, cleared on that
    path's next successful read.
  - `loadChildren(path)` — reads `path`'s direct children (`fetchImageDiffChildren`); no-op while
    `imageIdA`/`imageIdB` is `undefined`.
  - `reset()` — clears every loaded level, loading path and error; used when the diff view closes
    or a new comparison starts, so a stale level is never shown against a fresh comparison.

## Dependencies

- Image diff client (`fetchImageDiffChildren`)

## Requirements served

- plan-docker_management_app/REQ-63
