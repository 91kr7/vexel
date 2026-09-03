---
module: contexts
component: Contexts client
type: frontend data client
---

# Contexts client

**Purpose** → typed access to the server's context and daemon-information endpoints.

## Contract

- `createContext(input): Promise<ContextSummary>` — `input`: `{ name, kind: 'local' | 'ssh', host?,
  description? }`.
- `activateContext(name): Promise<ContextSummary>` — makes `name` the active context.
- `removeContext(name): Promise<void>`
- `fetchDaemonInfo(): Promise<DaemonInfo>`
- Every call rejects with an `Error` carrying the server's own `error` message when the response is
  not successful, and a generic `Request failed with HTTP <status>` when it carries no message.

## Rules and invariants

- The context name is URL-encoded in every path, so a name with a slash or a space is never mistaken
  for another route.
- The activation function is named `activateContext`, not `useContext`: a `use*` name at module
  level is read as a React Hook by the lint rules.

## Dependencies

- None (browser `fetch`).

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-94
