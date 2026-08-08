---
module: images
component: useImageChangesetStream
type: frontend hook
---

# useImageChangesetStream

**Purpose** → subscribes to the changeset analysis progress stream and collects its progress and
final result, until the server reports completion or failure (REQ-49, REQ-51).

## Contract

- `useImageChangesetStream(url: string | undefined): { progress?: ChangesetProgress, result?:
  ImageChangesets, done: boolean, error?: string }`
  - `ChangesetProgress`: `{ phase: 'exporting' } | { phase: 'analyzing', completedLayers,
    totalLayers }`.
  - Passing `undefined` keeps the stream closed and the result cleared.
  - `done` becomes `true` once the server reports completion or failure; `result` is set from the
    server's `result` event, arriving just before `done`.
  - `error` is set from the server's `error` event or a stream failure.

## Rules and invariants

- Disconnecting while `url` is set (a new `url`, or the consuming component unmounting) cancels the
  in-flight analysis server-side (REQ-51).

## Dependencies

- Image layers client (types only)

## Requirements served

- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-51
