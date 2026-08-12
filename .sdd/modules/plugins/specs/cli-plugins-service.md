---
module: plugins
component: CliPluginsService
type: backend service
---

# CliPluginsService

**Purpose** → the CLI plugins the local Docker installation ships — the `docker <name>`
sub-commands — with the version and the availability the installation itself reports.

## Contract

- `listCliPlugins() → PluginListing<CliPlugin>`
  - `PluginListing<T>` → `{ items: T[], unavailableReason?: string }`: a reading that may
    legitimately have nothing to show, with why in the installation's own words.
  - `CliPlugin` → `{ name, command, version?, vendor?, description?, path?, availability,
    unavailableReason? }`; `command` is the full invocation (`docker compose`), `version` absent
    when the installation reports none.
  - `availability` is one of:
    - `enabled` — the installation runs it and advertises it;
    - `available` — installed and runnable, but not advertised in `docker --help` (Docker's own
      "hidden" flag);
    - `unavailable` — the installation found it and refuses to run it; `unavailableReason` then
      carries the installation's own explanation, and only then.
  - The items come back **ordered by plugin name** under the list-order rule (`compareNames`). A CLI
    plugin carries no identifier other than its name, so the final comparison is **that same name
    compared exactly**, which separates two plugins whose names differ only in case or in leading
    zeros; the same plugins produce the same sequence on every read.
  - The local Docker installation not answering at all → an empty listing whose
    `unavailableReason` quotes the failure; never a rejection.
  - An answer that is not the installation's client information, or one that carries no plugin
    inventory → an empty listing whose `unavailableReason` says the installation does not expose
    one.

## Rules and invariants

- The reading is client-side only: it still answers while the daemon is unreachable, because a CLI
  plugin is part of the installation, not of the daemon.
- CLI plugins and daemon plugins are two unrelated sets and are never merged: this service knows
  nothing about the daemon's managed plugins (REQ-99).
- Nothing here changes anything: the CLI plugin inventory is read-only, since these plugins are
  files the operator installs themselves.

## Dependencies

- docker-access: CLI runner, Active endpoint
- list-order: List order (`byNameThenIdentity`)

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app-list_ordering/REQ-23
- plan-docker_management_app-list_ordering/REQ-25
