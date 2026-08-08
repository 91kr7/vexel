---
module: images
component: Image diff client
type: frontend data client
---

# Image diff client

**Purpose** → typed `fetch` wrapper for the cross-image filesystem diff comparison stream and its
lazy diff-tree directory-listing call (REQ-63, REQ-64).

## Contract

- `imageDiffStreamUrl(imageIdA, imageIdB): string` — builds `/api/images/diff/stream`; consumed
  with `useImageDiffStream`.
- `fetchImageDiffChildren(imageIdA, imageIdB, path?): Promise<ImageDiffEntry[]>` — `GET
  /api/images/diff/entries[?path=...]`; throws (including on a `404`, meaning this pair has not
  been compared yet) rather than returning an empty list.
- `ImageDiffStatus`: `'added' | 'removed' | 'changed'`. `ImageDiffNature`: `'content' | 'size' |
  'mode' | 'ownership' | 'symlink-target'`.
- `ImageDiffSideMetadata`: `{ sizeBytes?, mode?, uid?, gid?, linkTarget? }`.
- `ImageDiffEntry`: `{ path, name, kind: 'file' | 'directory' | 'symlink', status?: ImageDiffStatus,
  natures?: ImageDiffNature[], a?: ImageDiffSideMetadata, b?: ImageDiffSideMetadata, rollup?: {
  added, removed, changed } }` — `status` present only for a real added/removed/changed path,
  absent for a bare ancestor directory node; `rollup` present on a directory node.
- `ImageFilesystemDiff`: `{ imageIdA, imageIdB, entries: ImageDiffEntry[], addedCount,
  removedCount, changedCount }` — the full result carried by `useImageDiffStream`'s `result`.

## Rules and invariants

- A non-2xx response's error carries the server's own `error` message when the body is JSON with
  one, otherwise a generic `Request failed with HTTP <status>` message.

## Requirements served

- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-64
