---
module: plugins
component: usePlugins
type: frontend hook
---

# usePlugins

**Purpose** → both plugin inventories of the active installation, kept current, and the management
of the daemon ones.

## Contract

- `usePlugins(): { cli, daemon, loaded, error?, refresh, readPrivileges, install, enable, disable,
  inspect, remove }`
  - `cli: PluginListing<CliPlugin>`, `daemon: PluginListing<DaemonPlugin>` — read as one round, so
    the two panels never show two different moments of the same installation.
  - re-read on a bounded poll, on an active-context switch, and via `refresh()`.
  - `readPrivileges(remote): Promise<PluginPrivilege[]>` — what the reference asks for; installs
    nothing and stores nothing.
  - `install(input): Promise<DaemonPlugin>`, `enable(name)`, `disable(name)`,
    `remove(name): Promise<void>` — each re-reads the inventories on success; failures propagate to
    the caller (never swallowed) so the screen can report them.
  - `inspect(name): Promise<PluginInspect>` — read on demand, not held.

## Rules and invariants

- An answer that is not two listings is treated exactly like a failed read — reported through
  `error`, never stored — so no panel is ever handed something without an `items` array. One
  malformed side fails the whole round rather than half-updating the screen.
- The privileges a reference asks for are never cached: they are the subject of a decision taken
  now, and a stale copy could be granted against a plugin that has since changed what it asks for.
- Another context means another daemon: the reading is dropped and re-read on the active-context
  broadcast (REQ-93).
- The poll is deliberately slow: every state change this hook drives re-reads the inventories on
  its own, so the interval only has to notice a `docker plugin` command run from a terminal, or a
  CLI plugin dropped into the installation.
- Reads for no other reason of its own: a daemon event triggers nothing here
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1).
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- plugins: Plugins client
- contexts: Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
