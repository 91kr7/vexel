---
module: plugins
component: PluginsScreen
type: UI component
---

# PluginsScreen

**Purpose** → the plugins of the active installation: the CLI sub-commands Docker ships next to the
drivers the daemon runs, with everything needed to install, enable, disable, inspect and remove a
daemon one.

## Contract

Description:
- two panels side by side, as the screen is drawn: "CLI plugins" on the left, "Daemon plugins" on
  the right, each a list of one row per plugin.

Shows:
- CLI panel — one row per CLI plugin: a state dot, the invocation (`docker compose`), its version
  and its availability as a badge reading `enabled`, `available` or `unavailable`.
  - a plugin the installation refuses to run states why on the row; a working one is a single line.
  - a plugin the installation reports no version for reads "unavailable" in the version's place,
    with the reason on hover.
- Daemon panel — one row per daemon plugin: a state dot, the plugin's name, the interface it
  implements in words ("log driver", "volume driver", …), a badge reading `enabled`/`disabled`, and
  the row's controls.
- Either panel with nothing to show says why when the reading came with a reason (the installation
  exposes no CLI plugin inventory, the daemon exposes no managed plugins), and otherwise simply
  states there is none.
- A failed reading shows the failure with a retry, without hiding the panels.

Actions:
- "Install plugin" → a form asking for the reference and an optional alias, plus a switch for
  enabling it once installed (on by default). Submitting **installs nothing**: it reads the
  privileges the reference asks for and opens the confirmation that shows them.
- The privilege confirmation lists every privilege with its value and asks for an explicit grant;
  granting installs, cancelling installs nothing and gives the form back with what was typed in it.
  A successful install is announced, saying whether the plugin was left enabled or disabled.
- A reference asking for nothing says so in the dialog and still has to be granted. A reference
  nobody publishes reads the same way — the daemon cannot tell the two apart before the pull — and
  the install that follows the grant then fails with the daemon's own message, having installed
  nothing.
- the row's switch → enables or disables the plugin; it stays on the value that is still true and
  shows itself busy until the daemon confirms.
- "Inspect" → opens the plugin's full reading under its row (name, id, reference, interfaces,
  state, mounts, devices, capabilities, documentation, and the daemon's own document); pressing it
  again closes it.
- "Remove" → asks for a destructive confirmation naming the plugin and stating that its data goes
  with it and that an enabled plugin must be disabled first; once confirmed the plugin disappears
  from the list, and its open inspection closes with it.
- Every failure — install, enable, disable, remove — is reported with the daemon's own message, and
  leaves the list showing what is actually true.

## Rules and invariants

- Nothing is installed by a single click: the privileges are always shown, and only an explicit
  grant installs (REQ-99). Cancelling the grant installs nothing.
- Removal is the only destructive action here and always goes through the confirmation; enabling
  and disabling do not, being reversible by the same switch.
- The two panels are one reading: they are never seen showing two different moments of the same
  installation.
- The CLI panel is read-only — those plugins are files the operator installs themselves — and it
  keeps answering while the daemon is unreachable.

## Dependencies

- ui-library: Card, CardList, SectionHeader, Badge, Button, MetaCell, Toggle, ActionButtonGroup,
  DefinitionList, CodeViewer, FormDialog, FormField, TextField, ErrorBanner, EmptyState, Grid, Row,
  Stack, useToast
- plugins: usePlugins
- app-shell: ConfirmationService (`confirm`, `confirmPrivileges`), ErrorReportingService,
  ProgressService

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
