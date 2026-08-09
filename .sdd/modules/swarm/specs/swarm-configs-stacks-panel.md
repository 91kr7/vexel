---
module: swarm
component: SwarmConfigsStacksPanel
type: UI component
---

# SwarmConfigsStacksPanel

**Purpose** → the "Configs & stacks" panel of the Swarm screen: the cluster's configs with their name
and age, created, inspected and removed (REQ-84); and the stacks deployed on it, listed with their
services and removable (REQ-83). **It offers no way to deploy a stack.**

## Contract

Description:
- one card titled "Configs & stacks", holding two labelled groups as drawn in the mockup: the configs
  first, the stacks below them. A "New config" action sits in the panel header. Each row expands its
  detail inside the same card.

Shows:
- per config: the name, its age, and the stack it belongs to when it has one.
- for the opened config: its id, stack, creation and update times and labels.
- per stack: the name and a line counting its services, secrets, configs and networks.
- for the opened stack: one row per service with its image, mode and `running/desired` replicas.
- with nothing to show in a group: the reason the listing carries, "No configs" / "No stacks" on a
  manager with none, or the reading line before the first read settles.

Actions:
- "New config" → a form asking for a name, the config's content (entered in a multi-line editor)
  and optional labels.
- selecting a config or a stack row → expands it; selecting it again → collapses it.
- "Remove" on a config → asks the confirmation service; a service still using it keeps the daemon
  from removing it, and the confirmation says so.
- "Remove stack" → asks the confirmation service, naming the stack and stating that its services,
  secrets, configs and networks all go; on success it reports what was actually removed.
- creation and removal are absent when the daemon is not a manager.

## Rules and invariants

- **There is no deploy affordance, no compose-file path input and no compose editor** anywhere in
  this panel: stack deployment was withdrawn on 2026-08-07 (departure Three, REQ-83). Stacks are
  observed and removed.
- A stack is shown exactly as the daemon's labels describe it, so a stack deployed from a terminal
  appears here like any other.
- A config's content is treated with the same discipline as a secret's value: it is sent once and
  never read back, even though the daemon would return it (REQ-84).
- Labels are offered at creation, as a key/value editor, for the same reason as on a secret: a
  config created through the application can be marked as its own. A row with an empty key is
  dropped.

## Dependencies

- ui-library: Card, SectionHeader, CardList, Button, FormDialog, FormField, TextField, CodeEditor,
  DefinitionList, ActionButtonGroup, EmptyState, Stack
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
