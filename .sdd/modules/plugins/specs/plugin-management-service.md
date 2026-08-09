---
module: plugins
component: PluginManagementService
type: backend service
---

# PluginManagementService

**Purpose** → installing a daemon plugin from a reference once the privileges it asks for have been
granted, and enabling, disabling and removing an installed one.

## Contract

- `getPluginPrivileges(remote) → PluginPrivilege[]`
  - `PluginPrivilege` → `{ name, description?, values }` — what is being asked for (`network`,
    `mount`, `device`, `capabilities`, …), one line on what it allows, and the exact value(s).
  - Reads what the reference asks for **without installing anything**.
  - A plugin that asks for nothing → an empty list. So does a reference nobody publishes: the
    daemon answers an unknown reference the same way it answers a modest one, and neither the
    daemon nor this service can tell the two apart before the pull. Nothing is installed either
    way — a reference that does not exist fails at the pull, with the daemon's own message.
  - A daemon-side failure on the read itself (unreachable, refused) → that failure.
- `installPlugin({ remote, alias?, grantedPrivileges, enable? }) → DaemonPlugin`
  - re-reads the privileges `remote` asks for and rejects unless `grantedPrivileges` is exactly
    that set — same privileges, same values, nothing added, nothing dropped → error, HTTP `409`,
    stating that nothing has been installed.
  - effect on a matching grant: the plugin is pulled under `alias` (or under the reference's own
    name), then enabled unless `enable` is `false`.
  - answers with the installed plugin's summary, read back from the daemon.
  - a failure reported inside the pull's progress stream is the failure of the install; nothing is
    reported as installed.
  - a failure of the *enable* step that follows a successful pull is also the failure of the call —
    and the plugin stays installed and disabled, since the pull it succeeded at is not undone. The
    next reading of the inventory shows it there, disabled, and its switch enables it.
- `enablePlugin(name) → DaemonPlugin` — waits as long as the plugin's own handshake takes; answers
  with the plugin, now enabled.
- `disablePlugin(name) → DaemonPlugin` — answers with the plugin, now disabled.
- `removePlugin(name) → void` — removes the plugin from the daemon.
  - rejects with the daemon's own refusal when the plugin is still enabled; nothing is forced.

## Rules and invariants

- A plugin runs on the host with the mounts, devices and capabilities it asked for, so installing
  one is a security decision: the privilege check lives here, on the server, and no caller can
  install a plugin by skipping the review (REQ-99).
- What travels to the daemon as the grant is the set the daemon itself just asked for, rebuilt from
  its own answer — the caller's granted list is the proof of the decision, never the payload — so a
  privilege cannot be widened on the way through.
- Nothing is ever forced, neither on removal nor on disable: an enabled plugin may be driving live
  containers, and the daemon's refusal is passed on rather than overridden on the operator's behalf.
- The installed plugin is found in the daemon's own listing rather than guessed from the reference:
  the daemon normalizes a missing tag to `:latest`, and the name it filed the plugin under is the
  one every later call uses.

## Dependencies

- docker-access: EngineClient
- plugins: DaemonPluginsService

## Requirements served

- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
