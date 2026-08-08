---
module: images
component: useImageDiffStream
type: frontend hook
---

# useImageDiffStream

**Purpose** → subscribes to the cross-image diff comparison progress stream and collects its
progress and final result, until the server reports completion or failure (REQ-63, REQ-64).

## Contract

- `useImageDiffStream(url: string | undefined): { progress?: ImageDiffProgress, result?:
  ImageFilesystemDiff, done: boolean, error?: string }`
  - `ImageDiffProgress`: `{ phase: 'extracting', side: 'a' | 'b', extraction:
    FilesystemExtractionProgress } | { phase: 'comparing', comparedPaths, totalPaths }`.
  - Passing `undefined` keeps the stream closed and the result cleared.
  - `done` becomes `true` once the server reports completion or failure; `result` is set from the
    server's `result` event, arriving just before `done`.
  - `error` is set from the server's `error` event or a stream failure.

## Rules and invariants

- Disconnecting while `url` is set (a new `url`, or the consuming component unmounting) cancels the
  in-flight comparison server-side (including any extraction it started).

## Dependencies

- Image diff client (types only), useImageFilesystemExtraction (`FilesystemExtractionProgress`
  type)

## Requirements served

- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-64
