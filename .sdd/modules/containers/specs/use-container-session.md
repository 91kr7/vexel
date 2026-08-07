---
module: containers
component: useContainerSession
type: frontend hook
---

# useContainerSession

**Purpose** → the client-side duplex transport behind an exec/attach session: opens the WebSocket
channel, exposes imperative send/resize, a data subscription for the terminal, and closes explicitly
on unmount.

## Contract

- `useContainerSession(containerId?, kind: SessionKind, launch?: ExecLaunchOptions, active: boolean):
  { status, error?, exitCode?, send, resize, subscribe, close }`
  - `status: 'connecting' | 'open' | 'closed' | 'error'`.
  - `error?: string` — set when the server reports an error control message or the connection drops
    unexpectedly.
  - `exitCode?: number | null` — set from the server's `exit` control message.
  - `send(data: string)` — sends operator input; a no-op while the channel is not open.
  - `resize(cols, rows)` — sends a resize control message; a no-op while the channel is not open.
  - `subscribe(onData: (chunk: string) => void) → () => void` — registers a listener for incoming
    terminal output; returns the unsubscribe function.
  - `close()` — closes the WebSocket, tearing down the session on the server.
  - no channel is opened while `containerId` is undefined or `active` is false.

## Rules and invariants

- Output is delivered through `subscribe` callbacks rather than component state, so a fast-talking
  session does not force a re-render per chunk.
- The channel is closed when the caller unmounts, and reopened whenever `containerId`, `kind`,
  `active` or the `launch` options change.

## Dependencies

- Container session client (containerSessionUrl, ExecLaunchOptions, SessionKind)

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
