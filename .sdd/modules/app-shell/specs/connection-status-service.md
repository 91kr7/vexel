---
module: app-shell
component: ConnectionStatusProvider, useConnectionStatus
type: frontend service
---

# Connection status service

**Purpose** → gives every screen the same live daemon-connectivity picture app-wide: reachability
with cause, negotiated Engine API version, and local CLI/plugin availability with the capabilities
that are unavailable when a tool is missing (REQ-9, REQ-10, REQ-13, REQ-110). What it shows is what
the live channel delivered.

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
  - `loading` — `true` until the channel has delivered a status, and again from a discard until the
    next one is delivered.
  - `retry()` — asks for the live channel again when it is not delivering, and does nothing when it
    is: the status arrives on the channel, so there is nothing to re-read.
- Calling `useConnectionStatus()` outside a `ConnectionStatusProvider` throws.

## Rules and invariants

- **It holds no clock and makes no request**: the status arrives when the server pushes it, so a
  daemon that goes away and comes back is reported with the operator pressing nothing
  (…-multiplexed_sse/REQ-17, /REQ-19, /REQ-39). The probe itself stays real and stays on the server,
  which is the only place the negotiated API and engine versions can come from
  (…-multiplexed_sse/REQ-19).
- Before anything has been delivered — the first window after a server start, and the moment after a
  discard — the daemon reads as not reachable **with no cause**: nothing is claimed to have failed
  that has not.
- **A live channel that is not delivering is reported the same way**: `daemon.reachable: false` with
  a cause, through this same state and this same wording. It is the one indication the operator gets
  for a connection that is down, and no element and no wording of its own is added for the channel
  (…-multiplexed_sse/REQ-11, /REQ-35).
- Nothing is re-probed from here on a context switch: the server discards what it holds, says so on
  the channel, and probes the new context's daemon at once, so the status that arrives is that
  daemon's (REQ-93, …-multiplexed_sse/REQ-24).
- The manual reload reaches this status on the channel like any other value; what makes the refresh
  control wait is the channel's own end-of-reload message, not a read of this service's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- connectivity: ConnectionStatusService (the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-110
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-11
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-18
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-19
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-35
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
