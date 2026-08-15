---
module: swarm
component: SwarmSecretsPanel
type: UI component
---

# SwarmSecretsPanel

**Purpose** → the "Secrets" card of the Swarm screen: the cluster's secrets with their name and age,
created, inspected as metadata and removed. **A secret's value is never displayed** (REQ-84).

## Contract

- `<SwarmSecretsPanel secrets onCreate onRemove />`

Description:

- one card titled "Secrets", with the page-level action in the toolbar under its header and the
  object list's comfortable variant at the content column's full width; the selected secret's
  metadata is revealed below its row, at that same width.

Shows:

- one row per secret, in name order, with: the name, the stack it belongs to (`–` where none), the
  age of its creation and the age of its last update.
- for the opened secret: its id, name, creation and update ages, stack and labels — metadata, and
  only metadata, with a property stating in words that the value is never displayed.
- with no secret listed: the empty state's title, the line saying what a secret is and that it can
  never be read back, and the action that creates one — withheld where the reading itself states a
  reason.

Actions:

- "New secret" (toolbar, and the empty state's own action) → a form asking for a name, a value and
  optional labels; the value is entered in a masked field with no reveal control and is dropped from
  the form the moment it closes, whichever way it closed.
- selecting a row → reveals that secret's metadata; selecting it again, or `Escape`, closes it.
- "Remove" (row) → asks the confirmation service, naming the secret and stating that a service still
  using it keeps the daemon from removing it; only then is it removed.

## Rules and invariants

- **Nothing in this panel ever shows a secret's value**: it is typed once, sent, and never read back
  — there is no reveal affordance, no request that could return one, and no column and no property
  carrying one (REQ-84). The clause naming a copy affordance went with the affordance itself on
  2026-08-14 (`plan-docker_management_app-remove_copy_controls`); the panel offers none because the
  client offers none anywhere.
- The value lives in the form's state only while the form is open, and is cleared on submit, on
  cancel and on failure.
- **The panel is drawn only where there is a cluster to read**: the screen states the swarm's
  condition once and renders this panel on a manager alone
  (plan-ui-coherence-optimisation/REQ-52), so the panel repeats none of it.
- Every cell of a row is a fixed number of lines whatever the secret is: the stack a secret may
  belong to was a subtitle whose presence depended on the secret, and it is a column here. Measured:
  59.39px on every row at all three viewports.
- Labels are offered at creation, as a key/value editor: a secret created through the application can
  be marked as its own by whoever created it. A row with an empty key is dropped.
- One detail is open at a time, on this list and across the screen.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable, DetailPanel, ActionButtonGroup,
  TwoLineCell, MetaCell, EmptyState, Button, FormDialog, FormField, TextField, SecretField,
  KeyValueEditor, Stack
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-84
- plan-ui-coherence-optimisation/REQ-52
- plan-ui-coherence-optimisation/REQ-55
