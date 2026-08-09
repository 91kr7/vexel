---
module: app-shell
component: ConnectionStatusProvider, useConnectionStatus
type: frontend service
---

# Connection status service

**Purpose** → gives every screen the same live daemon-connectivity picture app-wide: reachability
with cause, negotiated Engine API version, and local CLI/plugin availability with the capabilities
that are unavailable when a tool is missing (REQ-9, REQ-10, REQ-13, REQ-110).

## Contract

- `<ConnectionStatusProvider children>` — must wrap any part of the tree that calls
  `useConnectionStatus()`.
- `useConnectionStatus(): ConnectionStatus & { loading, retry() }`
  - `daemon: { reachable, cause? }` — `cause` is the daemon's own error message, verbatim, when
    `reachable` is `false`.
  - `apiVersion?`, `engineVersion?` — set only when `reachable` is `true`.
  - `cli: { docker, compose, buildx }`, each `{ available, version? }`.
  - `unavailableCapabilities: string[]` — human-readable statements of what is unavailable and why,
    one per missing CLI/plugin.
  - `retry()` — re-fetches the status immediately, outside the regular poll interval.
- Calling `useConnectionStatus()` outside a `ConnectionStatusProvider` throws.

## Rules and invariants

- Polls the server's connectivity endpoint every 5 seconds so a daemon that comes back stays
  detected without a manual refresh (REQ-9).
- A fetch failure (server unreachable) is reflected as `daemon.reachable: false` with a cause,
  never as a thrown error or an empty screen (REQ-10).
- The status describes the daemon of the active context: on an active-context switch it is re-probed
  at once, without waiting for the next poll (REQ-93).

## Dependencies

- data-access: `fetchConnectionStatus`
- contexts: Active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
