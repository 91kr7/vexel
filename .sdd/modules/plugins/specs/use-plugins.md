---
module: plugins
component: usePlugins
type: frontend hook
---

# usePlugins

**Purpose** → both plugin inventories of the active installation as the live channel delivers them —
one round, so the two panels never show two different moments — and the management of the daemon
ones.

## Contract

- `usePlugins(): { cli, daemon, loaded, error?, refresh, readPrivileges, install, enable, disable,
  inspect, remove }`
  - `cli: PluginListing<CliPlugin>`, `daemon: PluginListing<DaemonPlugin>` — the two halves of the
    one round the channel last delivered; each an empty listing until it has delivered one.
  - `loaded` becomes `true` on the first round delivered, and goes back to `false` when the channel
    says the values held were discarded.
  - `error` carries a failure while the channel is not delivering, and is cleared as soon as it is.
  - `refresh()` asks for the channel again when it is not delivering, and does nothing when it is:
    the round arrives on the channel, so there is nothing to re-read.
  - `readPrivileges(remote): Promise<PluginPrivilege[]>` — what the reference asks for; installs
    nothing and stores nothing.
  - `install(input): Promise<DaemonPlugin>`, `enable(name)`, `disable(name)`,
    `remove(name): Promise<void>` — failures propagate to the caller (never swallowed) so the screen
    can report them.
  - `inspect(name): Promise<PluginInspect>` — read on demand, not held.

## Rules and invariants

- **It holds no clock and makes no request for the round**: it arrives when the server pushes it, and
  both halves come from the same reading (…-multiplexed_sse/REQ-17, /REQ-33, /REQ-39).
- A delivery that is not two listings is treated exactly like a failed read — reported through
  `error`, never shown — so no panel is ever handed something without an `items` array. One malformed
  side fails the whole round rather than half-updating the screen.
- **An action re-reads nothing here**: the server marks the round changed as part of the operation,
  so what the operator just did reaches the panels as the push that operation caused
  (…-multiplexed_sse/REQ-25).
- The privileges a reference asks for are never cached: they are the subject of a decision taken now,
  and a stale copy could be granted against a plugin that has since changed what it asks for.
- **What a change made outside the application costs**: a `docker plugin` command marks the round due
  on the daemon's own event and is seen at once; a CLI plugin dropped into the installation's plugin
  directory announces nothing and is noticed within the server's own period, with no client period of
  its own added to it.
- **A round delivered again unchanged replaces nothing**: the reference in hand is kept, so neither
  panel is redrawn. The rule lives in the pushed-value store this hook reads through
  (…-multiplexed_sse/REQ-12).
- Nothing is re-read on a context switch: the server discards what it holds, says so on the channel,
  and the new installation's round arrives on it (…-multiplexed_sse/REQ-24).
- The manual reload reaches this round on the channel like any other change; what makes the refresh
  control wait for it is the channel's own end-of-reload message, not a read of this hook's
  (…-multiplexed_sse/REQ-23).

## Dependencies

- live-channel: Pushed value store
- live-channel: Live channel client
- plugins: Plugins client (the actions, and `PluginsReading` — the shape the channel delivers)

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-59
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-20
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39
