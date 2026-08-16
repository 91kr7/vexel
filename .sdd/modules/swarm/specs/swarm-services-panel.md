---
module: swarm
component: SwarmServicesPanel
type: UI component
---

# SwarmServicesPanel

**Purpose** → the "Services & tasks" section of the Swarm screen: every service with its image, mode,
running/desired replicas and published ports, created, updated, inspected with its tasks, and
removed (REQ-82).

## Contract

- `<SwarmServicesPanel services onCreate onUpdate onRemove />`

Description:

- composed as containers and images are: the section header "Services & tasks" and the page-level
  action in the toolbar under it **above**, and then the object list (`DataTable`) alone in an
  **unpadded card it fills edge to edge**, at the content column's full width. The header is not on a
  surface: the panel's only surface is the list's own card. The selected service's detail is revealed
  below its row, inside the same table, at that same width, with its tasks as a list of their own
  inside it.
- **The tasks list takes no card of its own**: it is read inside the panel the row expanded into,
  which is already inside the services list's card, and a card inside a card is two surfaces where
  the contract asks for one. It is the same object list, in the same one presentation, nested exactly
  as the reference nests a list in a panel.

Shows:

- one row per service, in name order, with: the name, the image, the mode as a badge ("replicated" /
  "global"), `running/desired` replicas, the published ports (`8080:80/tcp`, `–` where none) and the
  stack it belongs to (`–` where none).
- for the opened service, in the detail panel: its id, image, mode, replicas, published ports, stack,
  environment and the age of its last update — then its tasks, one row each, with the slot, the node
  it runs on, its state as a dot and a word, its desired state, and the daemon's message where a task
  failed.
- while the tasks are being read: the nested list's own reading state; a failed read: the error with
  a retry, inside the panel.
- with no service listed: the empty state's title, the line saying what puts a service there, and the
  action that creates one — withheld where the reading itself states a reason, which creating a
  service would not resolve.

Actions:

- "Create service" (toolbar) and "Create the first service" (the empty state's own action) → the
  same form, asking for the name, image, mode, replica count, environment variables, published ports
  and labels; submitting creates the service and reports it. **Two controls, two names, and neither
  contains the other**, for the reason recorded in full in `swarm-secrets-panel.md` (DEF-2): while
  the list is empty both are on screen, and a name that is a prefix of another's is the same name to
  anything that finds a control by name. Identical labels are not the repair — they are the same
  collision.
- selecting a row → reveals that service's detail panel and reads its tasks; selecting it again, or
  `Escape`, closes it.
- "Update" (row) → the same form, filled with what the service currently is; only the fields that
  changed are sent.
- "Remove" (row) → asks the confirmation service, naming the service and stating that its tasks stop;
  only then is it removed.

## Rules and invariants

- **The panel is drawn only where there is a cluster to read**: the screen states the swarm's
  condition once and renders this panel on a manager alone
  (plan-ui-coherence-optimisation/REQ-52), so the panel repeats none of it.
- **Both lists are the containers list**, not merely table-like: one header row over a continuous
  run of rows, a single hairline between each pair, no gap between two rows and no surface, corner
  or outline of any row's own — and the **same row**, of the reference's own fixed height and
  vertical alignment, stating no row modifier of its own. There is no per-panel choice of
  presentation to be made here.
- Every cell of a row is a fixed number of lines whatever the service is: the stack a service may
  belong to and the ports it may publish shared one subtitle line, and each is a column here, where
  its absence is the column's own `–` and costs the row no height. Both lists' rows are the
  reference's own height, no cell asking for more room than the fixed-height row gives it. (The
  59.39px recorded for a service row before this list became the one presentation was the retired
  presentation's and is superseded; the task row's 56px was already the reference's.)
- **A task is listed, not described.** The tasks of the opened service are rows of the same object
  list the screen lists everything else with, rather than label/value pairs in the property grid: a
  task has a state, a node and a message, which is a row and not a property.
- The replica field is offered for a replicated service only: a global service runs one task per node
  and has no replica count, which the form states instead of accepting a number.
- Environment is edited as key/value pairs and sent as `KEY=value`, so a value containing `=` is
  preserved.
- A port with no published port is not sent: the panel publishes ports, it does not declare
  container-internal ones.
- Labels are offered on creation only, as a key/value editor: an update sends the service's whole
  current spec back, which preserves the labels it already carries. A row with an empty key is
  dropped rather than sent.
- The environment editor and the labels editor name their rows apart, so the create dialog holds no
  two fields with the same accessible name; each keeps its own add action ("Add variable" by default,
  "Add label" for the labels).
- Creating and updating never take a file: this panel composes a service from arguments (departure
  Three withdrew stack deployment, and no compose file is read anywhere on this screen).
- One detail is open at a time, on this list and across the screen.

## Dependencies

- ui-library: Card (unpadded, holding the list alone), SectionHeader, ScreenToolbar, DataTable,
  DetailPanel, ActionButtonGroup, TwoLineCell, MetaCell, BadgeListCell, StatusDotCell, EmptyState,
  Button, FormDialog, FormField, TextField, Select, NumberField, KeyValueEditor, RepeatableRowList,
  ErrorBanner, Stack, Row
- swarm: useSwarmServiceDetail, Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-82
- plan-ui-coherence-optimisation/REQ-52
- plan-ui-coherence-optimisation/REQ-55
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-20
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-39
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40
