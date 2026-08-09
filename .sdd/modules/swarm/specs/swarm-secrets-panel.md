---
module: swarm
component: SwarmSecretsPanel
type: UI component
---

# SwarmSecretsPanel

**Purpose** → the "Secrets" panel of the Swarm screen: the cluster's secrets with their name and
age, created, inspected as metadata and removed. **A secret's value is never displayed** (REQ-84).

## Contract

Description:
- one card titled "Secrets", one row per secret as drawn in the mockup — the name on the left, its
  age on the right — the selected one expanding its metadata inside the same card. A "New secret"
  action sits in the panel header.

Shows:
- per secret: the name and its age (`18d ago`), plus the stack it belongs to when it has one.
- for the opened secret: its id, the stack, its creation and update times and its labels — metadata,
  and only metadata, with a line saying the value cannot be read back.
- with nothing to show: the reason the listing carries, "No secrets" on a manager with none, or
  "Reading secrets…" before the first read settles.

Actions:
- "New secret" → a form asking for a name, a value and optional labels; the value is entered in a
  masked field with no reveal control and is dropped from the form the moment it closes, whichever
  way it closed.
- selecting a row → expands its metadata; selecting it again → collapses it.
- "Remove" → asks the confirmation service, naming the secret and stating that a service still using
  it keeps the daemon from removing it; only then is it removed.
- creation and removal are absent when the daemon is not a manager.

## Rules and invariants

- **Nothing in this panel ever shows a secret's value**: it is typed once, sent, and never read back
  — there is no reveal affordance, no copy affordance and no request that could return it (REQ-84).
- The value lives in the form's state only while the form is open, and is cleared on submit, on
  cancel and on failure.
- Labels are offered at creation, as a key/value editor: a secret created through the application
  can be marked as its own by whoever created it. A row with an empty key is dropped.
- The panel states the reason it is empty rather than showing an empty list.

## Dependencies

- ui-library: Card, SectionHeader, CardList, Button, FormDialog, FormField, TextField, SecretField,
  DefinitionList, ActionButtonGroup, EmptyState, Stack
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-84
