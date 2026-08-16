---
module: swarm
component: SwarmConfigsStacksPanel
type: UI component
---

# SwarmConfigsStacksPanel

**Purpose** → the configs and the stacks of the Swarm screen: the cluster's configs with their name
and age, created, inspected and removed (REQ-84); and the stacks deployed on it, listed with their
services and removable (REQ-83). **It offers no way to deploy a stack.**

## Contract

- `<SwarmConfigsStacksPanel configs stacks onCreateConfig onRemoveConfig onRemoveStack />`

Description:

- **two cards, one per inventory** — `Configs` then `Stacks` — each holding the object list's
  comfortable variant at the content column's full width. The configs card carries the page-level
  action in the toolbar under its header; a config's metadata is revealed below its row, and a
  stack's services are carried in the stack's own row whether it is opened or not.

Shows:

- per config: the name, the stack it belongs to (`–` where none), the age of its creation and the age
  of its last update.
- for the opened config: its id, name, creation and update ages, stack and labels, with a property
  stating in words that the content is never displayed.
- per stack: the name and its counts of services, secrets, configs and networks, each in its own
  column — and, inside the row itself, one line per service with its image, mode and
  `running/desired` replicas.
- with nothing listed: for the configs, the empty state's title, the line saying what a config is,
  and the action that creates one (withheld where the reading itself states a reason); for the
  stacks, the title, the line saying that a stack deployed from a terminal appears here, and **no**
  action — nothing in this application deploys one.
- a stack whose services have all gone: the nested list's own compact empty state.

Actions:

- "New config" (toolbar) and "Create the first config" (the configs empty state's own action) → the
  same form, asking for a name, the config's content (entered in a multi-line editor) and optional
  labels. **Two controls, two names, and neither contains the other**, for the reason recorded in
  full in `swarm-secrets-panel.md` (DEF-2); identical labels are not the repair, they are the same
  collision.
- selecting a config's row → reveals its metadata; selecting it again, or `Escape`, closes it.
- "Remove" on a config → asks the confirmation service; a service still using it keeps the daemon
  from removing it, and the confirmation says so.
- "Remove" on a stack → asks the confirmation service, naming the stack and stating that its
  services, secrets, configs and networks all go; on success it reports what was actually removed.

## Rules and invariants

- **There is no deploy affordance, no compose-file path input and no compose editor** anywhere here:
  stack deployment was withdrawn on 2026-08-07 (departure Three, REQ-83). Stacks are observed and
  removed.
- **One card per inventory, and that is what repairs the alignment**
  (plan-ui-coherence-optimisation/REQ-54). A single card holding both had to label its first list
  *inside its own body*, and that inner label — not a header sublabel, which this screen never used —
  is what started its content **25.4px below** the neighbouring `Secrets` card's at 1440×1000 and
  1280×800 on the delivered build. Two cards remove the cause: each carries one section header and
  starts its content 0px under it, exactly as every other card on the screen does.
- **A stack's services are carried by the row, not by a selection**: what a stack *is* is the
  services it holds, so they are a nested header-less list in the row's own content — the same
  composition the compose screen uses for a project's services, one list component rendering both
  levels.
- A stack is shown exactly as the daemon's labels describe it, so a stack deployed from a terminal
  appears here like any other.
- A config's content is treated with the same discipline as a secret's value: it is sent once and
  never read back, even though the daemon would return it (REQ-84). No column and no property carries
  one.
- Every cell of a row is a fixed number of lines whatever the object is: a config's stack and a
  stack's four counts were subtitle lines and are columns. Measured: 59.39px on every config and
  stack row, 56px on every nested service row, at all three viewports.
- **The panel is drawn only where there is a cluster to read**: the screen states the swarm's
  condition once and renders these cards on a manager alone
  (plan-ui-coherence-optimisation/REQ-52), so neither card repeats it.
- One detail is open at a time, on this list and across the screen.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable, DetailPanel, ActionButtonGroup,
  TwoLineCell, MetaCell, BadgeListCell, EmptyState, Button, FormDialog, FormField, TextField,
  CodeEditor, KeyValueEditor, Stack
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
- plan-ui-coherence-optimisation/REQ-52
- plan-ui-coherence-optimisation/REQ-54
- plan-ui-coherence-optimisation/REQ-55
