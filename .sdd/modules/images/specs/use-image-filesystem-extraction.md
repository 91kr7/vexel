---
module: images
component: useImageFilesystemExtraction
type: frontend hook
---

# useImageFilesystemExtraction

**Purpose** → subscribes to the filesystem extraction progress stream and collects its progress and
final result, until the server reports completion or failure (REQ-52, REQ-55, REQ-113).

## Contract

- `useImageFilesystemExtraction(url: string | undefined): { progress?: FilesystemExtractionProgress,
  result?: FilesystemExtractionResult, done: boolean, error?: string }`
  - `FilesystemExtractionProgress`: `{ phase: 'creating' } | { phase: 'copying' } | { phase:
    'indexing' }`.
  - Passing `undefined` keeps the stream closed and the result cleared.
  - `done` becomes `true` once the server reports completion or failure; `result` is set from the
    server's `result` event, arriving just before `done`.
  - `error` is set from the server's `error` event or a stream failure.

## Rules and invariants

- Disconnecting while `url` is set (a new `url`, or the consuming component unmounting) cancels the
  in-flight extraction server-side (REQ-55) — the intermediate container is still removed.

## Dependencies

- Image filesystem client (types only)

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-55
- plan-docker_management_app/REQ-113
