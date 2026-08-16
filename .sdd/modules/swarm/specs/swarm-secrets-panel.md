---
module: swarm
component: SwarmSecretsPanel
type: UI component
---

# SwarmSecretsPanel

**Purpose** → the "Secrets" section of the Swarm screen: the cluster's secrets with their name and
age, created, inspected as metadata and removed. **A secret's value is never displayed** (REQ-84).

## Contract

- `<SwarmSecretsPanel secrets onCreate onRemove />`

Description:

- composed as containers and images are: the section header "Secrets" and the page-level action in
  the toolbar under it **above**, and then the object list (`DataTable`) alone in an **unpadded card
  it fills edge to edge**, at the content column's full width. The header is not on a surface: the
  panel's only surface is the list's own card. The selected secret's metadata is revealed below its
  row, inside the same table, at that same width.

Shows:

- one row per secret, in name order, with: the name, the stack it belongs to (`–` where none), the
  age of its creation and the age of its last update.
- for the opened secret: its id, name, creation and update ages, stack and labels — metadata, and
  only metadata, with a property stating in words that the value is never displayed.
- with no secret listed: the empty state's title, the line saying what a secret is and that it can
  never be read back, and the action that creates one — withheld where the reading itself states a
  reason.

Actions:

- "New secret" (toolbar) and "Create the first secret" (the empty state's own action) → the same
  form, asking for a name, a value and optional labels; the value is entered in a masked field with
  no reveal control and is dropped from the form the moment it closes, whichever way it closed.
  **Two controls, two names, and neither name contains the other** — see the rule below.
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
- **The toolbar's action and the empty state's are two controls, and no name here contains
  another's.** Both open the same form, and while the list is empty both are on screen at once —
  the toolbar because a page-level action lives there
  (plan-ui-coherence-optimisation/REQ-41), the empty state's because an empty result states the way
  out of it (plan-docker_management_app/REQ-25, `ui-library/specs/empty-state.md`). They therefore
  have to be told apart *by name*, and "New secret" against "New secret…" did not manage it: a name
  that is a prefix of another's is the same name to anything that finds a control by its name, which
  is how one surface came to hold two controls answering to "New secret" (DEF-2, found by
  `client/e2e/exclusive/swarm-cluster.spec.ts` on a cluster with no secret in it — the state the
  empty state exists for, and the only one in which the two are ever drawn together).
  **Making the two labels identical is not the repair**: two controls with the same name are the
  same collision, and the delivered volumes and networks panels — identical on both controls since
  they were written — carry it latently to this day. The empty state's label is the invitation
  ("Create the first secret"); the toolbar keeps the standing action's word.
- **Deferred, deliberately, and named here so it is not mistaken for an oversight**: the product's
  ten toolbar primary actions are split on the ellipsis — four carry it (`Pull image…`,
  `Create volume…`, `Run container…`, `Create network…`) and six do not (`New secret`, `New config`,
  `Create service`, `Create builder`, `Create context`, `Install plugin`). Which of the two is right
  is a question no requirement of `plan-ui-coherence-optimisation` states, and settling it renames
  six controls that checks locate by name; it belongs to a report of its own, not to the closing
  batch of this plan.
- **The panel is drawn only where there is a cluster to read**: the screen states the swarm's
  condition once and renders this panel on a manager alone
  (plan-ui-coherence-optimisation/REQ-52), so the panel repeats none of it.
- **The list is the containers list**, not merely table-like: one header row over a continuous run
  of rows, a single hairline between each pair, no gap between two rows and no surface, corner or
  outline of any row's own — and the **same row**, of the reference's own fixed height and vertical
  alignment, stating no row modifier of its own. There is no per-panel choice of presentation to be
  made here.
- Every cell of a row is a fixed number of lines whatever the secret is: the stack a secret may
  belong to was a subtitle whose presence depended on the secret, and it is a column here — and the
  row is the reference's own height, no cell asking for more room than it gives. (The 59.39px
  recorded before this list became the one presentation was the retired presentation's row and is
  superseded by the reference's, whatever value that reads in the tree.)
- Labels are offered at creation, as a key/value editor: a secret created through the application can
  be marked as its own by whoever created it. A row with an empty key is dropped.
- One detail is open at a time, on this list and across the screen.

## Dependencies

- ui-library: Card (unpadded, holding the list alone), SectionHeader, ScreenToolbar, DataTable,
  DetailPanel, ActionButtonGroup, TwoLineCell, MetaCell, EmptyState, Button, FormDialog, FormField,
  TextField, SecretField, KeyValueEditor, Stack
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-84
- plan-ui-coherence-optimisation/REQ-52
- plan-ui-coherence-optimisation/REQ-55
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-20
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-39
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40
