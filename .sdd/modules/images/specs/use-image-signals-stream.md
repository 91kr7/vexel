---
module: images
component: useImageSignalsStream
type: frontend hook
---

# useImageSignalsStream

**Purpose** → subscribes to the layer-efficiency and secret-signal analysis progress stream and
collects its progress and final result, until the server reports completion or failure (REQ-65,
REQ-66, REQ-67).

## Contract

- `useImageSignalsStream(url: string | undefined): { progress?: LayerSignalsProgress, result?:
  LayerSignals, done: boolean, error?: string }`
  - `LayerSignalsProgress`: `{ phase: 'exporting' } | { phase: 'analyzing', completedLayers,
    totalLayers }` — shared shape with `ChangesetProgress`, since this job reuses the changeset job.
  - Passing `undefined` keeps the stream closed and the result cleared.
  - `done` becomes `true` once the server reports completion or failure; `result` is set from the
    server's `result` event, arriving just before `done`.
  - `error` is set from the server's `error` event or a stream failure.

## Rules and invariants

- Disconnecting while `url` is set (a new `url`, or the consuming component unmounting) cancels the
  in-flight analysis server-side.

## Dependencies

- Image signals client (types only)

## Requirements served

- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-66
- plan-docker_management_app/REQ-67
