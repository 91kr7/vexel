---
module: plugins
component: Plugins endpoints
type: REST endpoint
---

# Plugins endpoints

**Purpose** → exposes both plugin inventories and the management of the daemon ones to the client.

## Contract

- `GET /api/plugins` → both inventories in one reading, answered from the round the server holds.
  - `200` → `{ cli: PluginListing<CliPlugin>, daemon: PluginListing<DaemonPlugin> }` — the body
    unchanged, plus the read-time headers every held value carries (`X-Vexel-Read-At`,
    `X-Vexel-Age-Ms`, and `X-Vexel-Stale` when the last read failed).
  - a round never read before waits for the installation; a failure with nothing ever held is
    mapped exactly as a failure of the reading itself.
- `GET /api/plugins/privileges?remote=<reference>` → what the reference asks for, installing nothing.
  - `400` → `remote` missing or blank.
  - `200` → `PluginPrivilege[]`.
- `GET /api/plugins/inspect?name=<name>` → one daemon plugin in full.
  - `400` → `name` missing, blank, or not a plugin name.
  - `200` → `PluginInspect`.
- `POST /api/plugins/install` → installs a plugin once its privileges are granted.
  - request: `{ remote, alias?, grantedPrivileges, enable? }`.
  - `400` → `remote` missing or blank.
  - `400` → `grantedPrivileges` absent or not a list, stating that a plugin is never installed
    without its privileges being granted.
  - `409` → the granted privileges are not the ones the plugin asks for; nothing is installed.
  - `201` → the installed plugin.
- `POST /api/plugins/enable` → request `{ name }`; `400` when blank; `200` → the plugin, enabled.
- `POST /api/plugins/disable` → request `{ name }`; `400` when blank; `200` → the plugin, disabled.
- `DELETE /api/plugins?name=<name>` → removes the plugin.
  - `400` → `name` missing or blank.
  - `204` → removed.
- Any Docker-side failure on the above → `502` (or the error's own status code) with
  `{ error: message }`, Docker's own message verbatim.

## Rules and invariants

- A plugin name travels as a query parameter, never as a path segment: it carries slashes and a tag
  (`grafana/loki-docker-driver:latest`), which a path segment would either split or force to be
  escaped by every caller.
- `enable` defaults to true on install, as `docker plugin install` does; only an explicit `false`
  leaves the plugin installed and disabled.
- The two inventories are read as one round, and each carries its own unavailability, so one
  channel going quiet never hides the other. The round is what the server holds — one held value for
  both sides — so no answer ever puts two moments of the same installation on the screen.
- Every listing answered here is the held round: the installation is read once per period however
  many windows are open, and not at all while nobody is on the screen.

## Dependencies

- plugins: PluginsInventoryService, DaemonPluginsService, PluginManagementService
- refresh-cache: Held value response

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-54
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-56
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-60
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-61
