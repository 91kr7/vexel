---
module: contexts
component: ContextsScreen
type: UI component
---

# ContextsScreen

**Purpose** → the Contexts screen: every Docker context with its endpoint and which one is active,
creating a local-socket or SSH context, switching the active one, removing one, and the daemon
information of the context in use (REQ-92, REQ-93, REQ-94).

Description:
- Two side-by-side panels, as drawn in `.sdd/analysis/ui-mock/contexts.png`. On the left, "Docker
  contexts" with a "Create context" action in its header and one card row per context. On the right,
  "Daemon of active context" holding the daemon's readings as label → value rows.

Shows:
- One row per context, **whatever its endpoint kind**: `name (kind)` as title — `local`, `ssh` or
  `tcp` — its endpoint URL in monospace below, suffixed with `(tls)` when the context carries TLS
  material, and its description on a further line when it has one. A TCP+TLS context created outside
  the application is shown exactly like the others: never filtered out, never greyed out, never
  marked unsupported.
- A leading dot on every row, green on the active context and muted on the others; the active row
  carries an "active" marker, every other row a "use" action.
- An "unreadable" badge on a context Docker itself reports an error for; the row stays listed.
- "Loading contexts…" before the first read has settled, "No Docker contexts" when the installation
  has none, and an error banner with retry when the inventory cannot be read.
- For the active context's daemon: Docker version, Engine API version, BuildKit version, storage
  driver, cgroup driver (with its version), OS / Arch (OS type, kernel version, architecture), root
  directory, and container counts as `total (running)`.
- "not reported" in place of the BuildKit version when the buildx plugin is absent — the rest of the
  reading is shown regardless.
- "Reading the daemon…" while the first reading is in flight, and an error banner with retry when it
  fails, in place of the readings.

Actions:
- "Create context" → opens a form: name, the endpoint group (kind, and the SSH destination when the
  SSH kind is chosen), and an optional description. Submitting creates the context and closes the
  form; a refusal is reported and the form stays open with what was typed.
- A row's "use" → makes that context active; every screen then follows the new daemon and the shell
  footer names it. A toast confirms the switch; a refusal is reported.
- A row's "Remove" → asks for confirmation, naming the context and stating that only the local entry
  goes, not the daemon it points at; once confirmed, the context disappears from the list.

Does not:
- Offer a TCP+TLS creation kind, TLS-material inputs, or any path input (withdrawn half of REQ-92,
  departure Three): the form's local kind states which socket it uses instead of asking for it.

## Rules and invariants

- The creation form offers exactly two endpoint kinds, local socket and SSH, and cannot be submitted
  without a name, nor with the SSH kind and no destination.
- The endpoint kinds a context can be *created* with are a subset of the kinds that can be *listed
  and used*: the list and the "use" action treat every kind alike.

## Decisions recorded

- The destructive action is labelled "Remove", not the mockup's `rm`: every other screen of the
  application uses "Remove" for the same action, and one shorthand label is not worth the
  divergence. Everything else in the content area follows the mockup as drawn.
- The local-socket kind asks for nothing: the batch forbids any path input, so the endpoint is the
  default Docker socket of the machine running the server, stated in the form rather than typed.

## Dependencies

- ui-library: Card, SectionHeader, CardList (selection variant), Badge, ActionButtonGroup,
  DefinitionList, FormDialog, FormField, EndpointField, TextField, Grid, Stack, EmptyState,
  ErrorBanner, useToast
- contexts: useContexts, useDaemonInfo
- app-shell: useConfirmation, useProgress, useErrorReporter

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-94
