---
module: plugins
component: DaemonPluginsService
type: backend service
---

# DaemonPluginsService

**Purpose** → the plugins the daemon itself runs — log, volume, network and other drivers — with
the interface each implements and whether it is enabled.

## Contract

- `listDaemonPlugins() → PluginListing<DaemonPlugin>`
  - `DaemonPlugin` → `{ id, name, reference?, enabled, interfaceTypes, type, description? }`;
    `name` is the name the daemon addresses it by (`grafana/loki-docker-driver:latest`),
    `interfaceTypes` the interfaces verbatim (`docker.volumedriver/1.0`), `type` those same
    interfaces said in words.
  - `type` reads "volume driver", "network driver", "IPAM driver", "log driver", "authorization",
    "secret provider" or "metrics collector"; an interface with no such wording is shown as the
    daemon names it, and a plugin declaring none reads "plugin".
  - The items come back ordered by name.
  - A daemon that does not expose managed plugins at all → an empty listing whose
    `unavailableReason` quotes the daemon; any other daemon failure is raised.
- `getDaemonPlugin(name) → DaemonPlugin` — one plugin's summary; the shape every state change
  answers with.
- `inspectPlugin(name) → PluginInspect` — the summary plus `{ documentation?, mounts, devices,
  capabilities, env, raw }`, `raw` being the daemon's own inspect document untouched.
- Either lookup with a name the daemon does not know → the daemon's own "not found" failure.

## Rules and invariants

- A daemon that exposes the plugin API and has no plugin answers with an empty listing and **no**
  reason: "none installed" and "cannot be read" are never told apart by an empty list alone.
- A plugin name carries a registry host that may itself carry a port, a repository path and a tag —
  `grafana/loki:latest`, `localhost:5000/driver:v1` —, so its slashes, port and colon belong to it
  and reach the daemon as they are, exactly as the Docker CLI sends them. A private registry
  listening on a port is named that way on every call, listing included.
- A `:…` on the first component is a port only when path components follow it; on a name with no
  path, a trailing `:…` is the tag (`sshfs:latest`).
- A name outside that alphabet is refused before any call is made (`400`), so a name can never walk
  out of the plugin routes.
- Read-only: nothing here installs, enables, disables or removes.

## Dependencies

- docker-access: EngineClient
- plugins: CliPluginsService (the shared `PluginListing` shape)

## Requirements served

- plan-docker_management_app/REQ-99
