---
module: plugins
component: PluginsInventoryService
type: backend service
---

# PluginsInventoryService

**Purpose** → the plugins reading of the active installation as **one round** — the CLI inventory
and the daemon inventory read together — and that round held by the refresh cache, so the
installation is read once per period however many windows are open.

## Contract

- `readPluginsInventory() → { cli: PluginListing<CliPlugin>, daemon: PluginListing<DaemonPlugin> }`
  - reads both sides together and answers with both, so the two never describe two different
    moments of the same installation
  - each side keeps carrying its own stated unavailability: an installation that exposes no CLI
    inventory, or a daemon that exposes no managed plugins, is a reason on that side and not a
    failure of the round
  - a side that fails outright — an unreachable daemon — is the failure of the round; nothing
    partial is ever answered
- `pluginsInventoryCache` — that round as a held value of the refresh cache
  - key `plugins`, period **30 000 ms**, a bare figure beside the kind like every other registered
    kind's
  - marked due by the daemon's `plugin` events
  - `read()` → the held round, with its read time and staleness; the first ask reads, and a read
    already running is joined rather than started again
  - `markChanged()` → states that the application itself has just changed the installation, so the
    next answer describes it

## Rules and invariants

- **The round is held whole.** One kind holds both sides, never one kind per side: two kinds would
  each have a period of their own, and the first period where only one of them read would put two
  moments of the same installation on the screen at once.
- **What an event does not reach.** A `plugin` event covers what the daemon does with its managed
  plugins, and nothing else: a plugin dropped into the installation's CLI plugin directory announces
  nothing at all. Such a change is noticed within the period plus the screen's own poll — about
  three quarters of a minute — and at once on the operator's refresh
  (`plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-59`).
- Nothing is read while nobody is asking: registering the kind calls neither channel, and a whole
  expiry window with no request stops the reading and drops what was held, so the next request reads
  fresh.
- It behaves like every other held value in the three cases the cache decides: the manual reload
  reads it again when it is held and skips it when it is not, a read that fails leaves the last
  round standing and is reported as staleness, and a context switch drops it.

## Dependencies

- plugins: CliPluginsService, DaemonPluginsService
- refresh-cache: Refresh cache

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-54
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-55
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-56
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-58
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-59
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-61
