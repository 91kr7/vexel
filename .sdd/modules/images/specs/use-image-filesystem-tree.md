---
module: images
component: useImageFilesystemTree
type: frontend hook
---

# useImageFilesystemTree

**Purpose** → lazy per-directory queries over an already-extracted image filesystem, so a large
tree is read one directory level at a time rather than fetched whole (REQ-52).

## Contract

- `useImageFilesystemTree(imageId: string | undefined): { childrenByPath, loadingPaths,
  errorsByPath, loadChildren, reset }`
  - `childrenByPath: Map<string, FilesystemEntry[]>` — loaded children keyed by parent path (`''`
    for the root); absent means not requested yet.
  - `loadingPaths: Set<string>` — paths currently being read.
  - `errorsByPath: Map<string, string>` — the last read failure's message per path, cleared on that
    path's next successful read.
  - `loadChildren(path)` — reads `path`'s direct children (`fetchImageFilesystemChildren`);
    no-op while `imageId` is `undefined`.
  - `reset()` — clears every loaded level, loading path and error; used when the browser closes or a
    re-extraction starts, so a stale level is never shown against fresh extraction data.

## Dependencies

- Image filesystem client (fetchImageFilesystemChildren)

## Requirements served

- plan-docker_management_app/REQ-52
