---
module: images
component: Image filesystem client
type: frontend data client
---

# Image filesystem client

**Purpose** → typed `fetch` wrapper for the filesystem extraction/tree-read endpoints (REQ-52–56,
REQ-113).

## Contract

- `imageFilesystemStreamUrl(id, force?): string` — builds `/api/images/{id}/filesystem/stream`
  (`?force=true` when `force`); consumed with `useImageFilesystemExtraction`.
- `fetchImageFilesystemChildren(id, path?): Promise<FilesystemEntry[]>` — `GET
  /api/images/{id}/filesystem/entries[?path=...]`; throws (including on a `404`, meaning the
  filesystem has not been extracted yet) rather than returning an empty list.
- `FilesystemEntry`: `{ path, name, kind: 'file' | 'directory' | 'symlink', sizeBytes? }`.
- `FilesystemExtractionResult`: `{ imageId, entryCount, fromCache }`.

## Rules and invariants

- A non-2xx response's error carries the server's own `error` message when the body is JSON with
  one, otherwise a generic `Request failed with HTTP <status>` message.

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-53
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-55
- plan-docker_management_app/REQ-56
- plan-docker_management_app/REQ-113
