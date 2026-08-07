---
module: containers
component: Container interactive sessions endpoint
type: WebSocket endpoint
---

# Container interactive sessions endpoint

**Purpose** → exposes `ContainerExecService` and `ContainerAttachService` to the client as duplex
WebSocket channels.

## Contract

- `WS /api/containers/:id/exec?cmd=…&user=…&workdir=…`
  - `cmd` may repeat (one query parameter per argv token); defaults to `['/bin/sh']` when absent.
  - `user`, `workdir` are optional, forwarded to `ContainerExecService`.
  - Opens an exec session; behaves as described below.
- `WS /api/containers/:id/attach`
  - Opens an attach session; behaves as described below.
- Once open, both endpoints:
  - relay binary frames as raw terminal I/O in both directions (client keystrokes/paste in, session
    output out);
  - accept a client JSON text frame `{ "type": "resize", "cols": number, "rows": number }` to
    propagate a terminal size change;
  - send a JSON text frame `{ "type": "exit", "code": number | null }` when the session ends, then
    close the socket;
  - send a JSON text frame `{ "type": "error", "message": string }` when the session cannot be
    opened or fails, then close the socket.
- A request whose path matches neither pattern is not claimed (left for the caller to reject).

## Rules and invariants

- Closing the WebSocket from the client always tears down the underlying exec/attach instance on
  the daemon, whichever side initiated the close.
- Attach sessions never issue a stop/kill request when the client disconnects — the container keeps
  running (see `ContainerAttachService`).
- No frame sent by the client is lost, including one sent immediately after the socket opens, before
  the underlying exec/attach session has finished being created: it is queued and relayed as soon as
  the session becomes ready.

## Dependencies

- ContainerExecService
- ContainerAttachService

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
