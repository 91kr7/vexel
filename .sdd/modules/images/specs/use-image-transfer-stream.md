---
module: images
component: useImageTransferStream, useFileUpload
type: frontend hook
---

# useImageTransferStream

**Purpose** → subscribes to a pull or push progress stream and collects its per-layer steps for
display, until the daemon reports completion or failure.

## Contract

- `useImageTransferStream(url: string | undefined): { steps: ImageTransferStep[], done: boolean,
  error?: string }`
  - Passing `undefined` keeps the stream closed and the result at its initial empty/not-done state.
  - `steps` keeps each step id's most recent state (a later `step` event for the same `id` replaces
    its entry in place; a new `id` is appended) — mirrors how Docker re-emits status per layer as a
    pull/push advances.
  - `done` becomes `true` once the stream ends or errors.
  - `error` carries the daemon's failure message when the stream ends in error; `undefined` on a
    clean completion.
- Opening a new `url` (or closing on `undefined`) resets `steps`, `done` and `error`.

## Rules and invariants

- The `EventSource` is closed as soon as the stream reports `end` or `error`, and on unmount — no
  reconnection: a transfer is a one-shot, user-initiated operation, not a long-lived monitor.

## Dependencies

- None (browser `EventSource` against the URL built by the Images client).

# useFileUpload

**Purpose** → uploads a local file (image tarball to load, filesystem tarball to import) with byte
progress and a working cancel, until the server reports completion or failure (REQ-42, REQ-43): on
an upload the application owns the bytes as it sends them, unlike a save/export download, which the
browser carries end to end on its own.

## Contract

- `useFileUpload<TResult>(): { status, currentBytes, totalBytes, result?: TResult, error?, start,
  cancel, reset }`
  - `status`: `'idle' | 'uploading' | 'processing' | 'done' | 'error'` — `'idle'` before `start` is
    called or after `reset`; `'uploading'` while bytes are still going out; `'processing'` once every
    byte has been sent but the server has not yet answered (docker digesting the tarball);
    `'done'`/`'error'` once the server responds.
  - `start(url, file)` — `POST`s `file`'s raw bytes to `url`, streamed straight from disk by the
    browser (the hook never reads `file` into memory itself); resets `currentBytes`/`totalBytes` to
    `0`/`file.size` and `status` to `'uploading'`.
  - `cancel()` — aborts an in-flight upload and returns to `'idle'`; a no-op once `status` is
    `'done'` or `'error'`.
  - `reset()` — aborts an in-flight upload (if any) and returns to the initial `'idle'` state.
  - `result` — the server's JSON response body, set only once `status` becomes `'done'`.
  - `error` — the server's `{ error }` message (or a generic `HTTP <status>`/"interrupted" message),
    set only once `status` becomes `'error'`.

## Rules and invariants

- Byte progress (`currentBytes`/`totalBytes`) comes from the browser's own upload progress events,
  never computed by reading the file in JavaScript.
- `start` on an already-active upload replaces it: the previous `XMLHttpRequest` is not explicitly
  aborted first, but its callbacks are superseded by the new one's state updates.

## Dependencies

- None (browser `XMLHttpRequest` against a URL built by the Images client or the Container transfer
  client).

## Requirements served

- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
