---
module: volumes-networks
component: NetworksPanel
type: UI component
---

# NetworksPanel

**Purpose** → every network, its create/inspect/remove actions, prune of unused networks, and
attaching/detaching a container directly from its attached-containers chips (REQ-72, REQ-73,
REQ-74).

## Contract

- `<NetworksPanel networks loaded error? onRefresh />` — `networks: NetworkSummary[]`, `onRefresh:
  () => void` re-reads the list (the caller owns `useNetworks()`).

Description:
- A card headed "Networks" with "Create" and "Prune" actions, and a `CardList` of every network
  below it.
Shows:
- One row per network: the name, a "`<subnet>` · gw `<gateway>`" monospace secondary line (or "no
  subnet" when the network has none) and "`<driver>` · `<scope>`" trailing the row.
- Below each row, a chip group of the network's attached containers, each chip carrying a "detach"
  action, plus a trailing "+ Attach" affordance; "No attached containers" in place of the chips when
  none are attached.
- An empty/loading state when there are no networks.
- Selecting a row expands its inline inspect surface directly below it: driver, scope, subnet,
  gateway, IP range, options, labels, the raw inspect payload, and a "Remove" action; selecting the
  same row again collapses it.
Actions:
- "Create" opens a `FormDialog` for a name, a driver (free text, suggesting `bridge`/`overlay`/
  `macvlan`), subnet, gateway, IP range, options and labels (each a repeatable key/value list);
  submitting creates the network, closes the dialog and re-reads the list.
- A chip's "detach" action detaches that container immediately (no confirmation) and re-reads the
  list; failure reports the daemon's own message via `useErrorReporter()`.
- A row's "+ Attach" affordance opens a `FormDialog` offering a `Combobox` of known container names
  (from `useContainers()`); submitting attaches that container, closes the dialog and re-reads the
  list.
- A selected row's "Remove" action goes through `useConfirmation().confirm()` first; cancelling
  performs nothing. On success it collapses the row and re-reads the list.
- "Prune" confirms first, then reports the number of networks removed via `useToast()` on success
  and re-reads the list; any failure reports the daemon's own message via `useErrorReporter()`.

## Rules and invariants

- "Prune" is disabled when there is no network to prune.
- Only one network's inspect surface is expanded at a time.
- In the create dialog the option rows and the label rows carry distinct accessible names, so no two
  of its fields are announced alike.
- Attach and detach are not routed through the confirmation service: neither is destructive to data.

## Dependencies

- ui-library: Card, SectionHeader, CardList, ChipGroup, FormDialog, FormField, TextField, Combobox,
  KeyValueEditor, DefinitionList, CodeViewer, ErrorBanner, EmptyState, Button, Row, Stack, useToast
- Networks client, useNetworkInspect
- containers module: useContainers
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
