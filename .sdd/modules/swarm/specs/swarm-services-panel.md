---
module: swarm
component: SwarmServicesPanel
type: UI component
---

# SwarmServicesPanel

**Purpose** → the "Services & tasks" panel of the Swarm screen: every service with its image, mode,
running/desired replicas and published ports, created, updated, inspected with its tasks, and
removed (REQ-82).

## Contract

Description:
- one card titled "Services & tasks", one row per service as drawn in the mockup — the service name
  on the left, its image, its `running/desired` count and its mode badge on the right — with the
  inspection of the selected service expanded inside the same card. A "Create service" action sits
  in the panel header.

Shows:
- per service: the name, the stack it belongs to and its published ports as a monospace line, the
  image, `running/desired` and a badge reading "replicated" or "global".
- for the opened service: image, mode, replicas, ports, environment, labels and creation/update
  times, then one row per task with its slot, the node it runs on, its state and its desired state,
  a failed task showing the daemon's message.
- while the tasks are being read: a pending line; a failed read: the error with a retry.
- with nothing to show: the reason the listing carries (a daemon outside a swarm says so), "No
  services" on a manager with none, or "Reading services…" before the first read settles.

Actions:
- "Create service" → a form asking for the name, image, mode, replica count, environment variables,
  published ports and labels; submitting creates the service and reports it.
- selecting a row → opens it and reads its tasks; selecting it again → closes it.
- "Update" on the opened service → the same form, filled with what the service currently is; only
  the fields that changed are sent.
- "Remove" on the opened service → asks the confirmation service, naming the service and stating
  that its tasks stop; only then is it removed.
- every action is absent when the daemon is not a manager.

## Rules and invariants

- The replica field is offered for a replicated service only: a global service runs one task per
  node and has no replica count, which the form states instead of accepting a number.
- Environment is edited as key/value pairs and sent as `KEY=value`, so a value containing `=` is
  preserved.
- A port with no published port is not sent: the panel publishes ports, it does not declare
  container-internal ones.
- Labels are offered on creation only, as a key/value editor: an update preserves the labels the
  service already carries, so the field would have nothing to add there. A row with an empty key is
  dropped rather than sent.
- Creating and updating never take a file: this panel composes a service from arguments (departure
  Three withdrew stack deployment, and no compose file is read anywhere on this screen).

## Dependencies

- ui-library: Card, SectionHeader, CardList, Badge, Row, Stack, Button, FormDialog, FormField,
  TextField, Select, NumberField, KeyValueEditor, RepeatableRowList, DefinitionList,
  ActionButtonGroup, EmptyState, ErrorBanner, MetaCell
- swarm: useSwarmServiceDetail, Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-82
