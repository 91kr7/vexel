---
module: plugins
component: Plugins client
type: frontend data client
---

# Plugins client

**Purpose** → typed access to the server's plugin endpoints.

## Contract

- `fetchPlugins(): Promise<{ cli: PluginListing<CliPlugin>, daemon: PluginListing<DaemonPlugin> }>`
- `fetchPluginPrivileges(remote): Promise<PluginPrivilege[]>` — what the reference asks for;
  installs nothing.
- `fetchPluginInspect(name): Promise<PluginInspect>`
- `installPlugin({ remote, alias?, grantedPrivileges, enable? }): Promise<DaemonPlugin>`
- `enablePlugin(name): Promise<DaemonPlugin>`, `disablePlugin(name): Promise<DaemonPlugin>`
- `removePlugin(name): Promise<void>`
- Every call rejects with an `Error` carrying the server's own `error` message when the response is
  not successful, and a generic `Request failed with HTTP <status>` when it carries no message.

## Rules and invariants

- The reference and the plugin name are URL-encoded into the query, so a name with a slash or a tag
  is never mistaken for another route.
- `grantedPrivileges` is passed through exactly as the server reported it: this client neither
  builds nor edits a privilege.

## Dependencies

- None (browser `fetch`).

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
