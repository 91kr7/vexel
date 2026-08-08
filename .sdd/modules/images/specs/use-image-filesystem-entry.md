---
module: images
component: useImageFilesystemEntryMetadata, useImageFilesystemEntryContent
type: frontend hook
---

# useImageFilesystemEntryMetadata, useImageFilesystemEntryContent

**Purpose** → reads a selected tree entry's metadata, and — for a file — its preview content, so the
filesystem browser's detail panel follows the selection directly from the server rather than from
whichever tree levels happen to be loaded client-side (REQ-58, REQ-59).

## Contract

- `useImageFilesystemEntryMetadata(imageId, path): { metadata, loading, error }` — re-reads whenever
  `imageId`/`path` changes; `path: undefined` fetches nothing and clears `metadata`.
- `useImageFilesystemEntryContent(imageId, path, mode): { content, loading, error }` — re-reads
  whenever `imageId`/`path`/`mode` changes; `mode?: FilesystemContentMode` overrides
  auto-detection; `path: undefined` fetches nothing and clears `content`. `error` carries the
  server's refusal reason for a directory or a symlink (REQ-59).

## Dependencies

- Image filesystem client (`fetchImageFilesystemEntryMetadata`, `fetchImageFilesystemEntryContent`)

## Requirements served

- plan-docker_management_app/REQ-58
- plan-docker_management_app/REQ-59
