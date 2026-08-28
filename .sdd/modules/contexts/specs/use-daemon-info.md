---
module: contexts
component: useDaemonInfo
type: frontend hook
---

# useDaemonInfo

**Purpose** → reads the daemon information of the active context, and re-reads it whenever another
context becomes the active one.

## Contract

- `useDaemonInfo(): { info?, loaded, error?, refresh }`
  - `info: DaemonInfo | undefined` — read once on mount, again on `refresh()`, and again on every
    active-context switch.
  - `error` carries the server's own message when the reading fails; `info` is cleared in that case,
    so a failed reading never leaves the previous daemon's numbers on screen.
  - `loaded` turns true once the first attempt has settled, whether it succeeded or not.
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- contexts: Contexts client, Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-94
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
