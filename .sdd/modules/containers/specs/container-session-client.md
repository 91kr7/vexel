---
module: containers
component: Container session client
type: frontend data client
---

# Container session client

**Purpose** → typed description of the server's interactive-session WebSocket endpoint and the URL
builder for it.

## Contract

- `type SessionKind = 'exec' | 'attach'`
- `interface ExecLaunchOptions { cmd: string[], user?: string, workingDir?: string }`
- `containerSessionUrl(id, kind, launch?) → string`
  - builds a `ws://`/`wss://` URL (matching the page's protocol) to
    `/api/containers/:id/exec` or `/api/containers/:id/attach`.
  - `launch` (only meaningful for `'exec'`) is encoded as `cmd` (repeated), `user`, `workdir` query
    parameters.

## Dependencies

- None.

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
