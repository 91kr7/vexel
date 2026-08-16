---
module: contexts
component: ContextsScreen
type: UI component
---

# ContextsScreen

**Purpose** → the Contexts screen: every Docker context with its endpoint and which one is active,
creating a local-socket or SSH context, switching the active one and removing one (REQ-92, REQ-93).

Description:
- One full-width card holding one list: "Docker contexts", its "Create context" action in the screen
  toolbar under the section header, and the contexts in the object list's comfortable variant — one
  row per context, aligned columns, and the selected row's detail revealed inside the same card at
  the content column's full width.

Shows:
- One row per context, **whatever its endpoint kind**, in aligned columns: a marker on the context in
  use, the context's name over its kind (`local`, `ssh` or `tcp`), its endpoint, whether it carries
  TLS material, its description, and the state Docker reports for it. A TCP+TLS context created
  outside the application is shown exactly like the others: never filtered out, never greyed out,
  never marked unsupported.
- An "unreadable" marker in the state column for a context Docker itself reports an error for, and
  nothing there for one it reads; the row stays listed either way, and Docker's own message is in the
  row's detail.
- "Loading contexts…" before the first read has settled; "No Docker contexts" with its explanation
  and a "Create the first context" action when the installation has none; an error banner with retry
  when the inventory cannot be read.
- A selected row's detail: name, kind, **the endpoint in full**, TLS, description, whether it is in
  use, and Docker's message where there is one.

Actions:
- "Create context" (toolbar) and "Create the first context" (the empty state's own action) → the
  same form: name, the endpoint group (kind, and the SSH destination when the
  SSH kind is chosen), and an optional description. Submitting creates the context and closes the
  form; a refusal is reported and the form stays open with what was typed.
- A row's "Use" → makes that context active; every screen then follows the new daemon and the shell
  footer names it. A toast confirms the switch; a refusal is reported. Offered on every row but the
  one already in use.
- A row's "Remove" → asks for confirmation, naming the context and stating that only the local entry
  goes, not the daemon it points at; once confirmed, the context disappears from the list, and its
  detail closes with it.
- Selecting a row → opens its detail below it; selecting it again closes it.

Does not:
- Offer a TCP+TLS creation kind, TLS-material inputs, or any path input (withdrawn half of REQ-92,
  departure Three): the form's local kind states which socket it uses instead of asking for it.
- **Describe the daemon of the active context.** See the decision below; System & prune does.

## Rules and invariants

- The creation form offers exactly two endpoint kinds, local socket and SSH, and cannot be submitted
  without a name, nor with the SSH kind and no destination.
- **The toolbar's action and the empty state's are two controls, and neither name contains the
  other.** Both open that form, and while the list is empty both are on screen at once — the toolbar
  because a page-level action lives there (plan-ui-coherence-optimisation/REQ-41), the empty state's
  because an empty result states the way out of it (plan-docker_management_app/REQ-25). A name that
  is a prefix of another's is the same name to anything that finds a control by name, so "Create
  context…" beside "Create context" was one control under two labels; identical labels are not the
  repair, they are the same collision. The reasoning is recorded in full, once, in
  `swarm/specs/swarm-secrets-panel.md` (DEF-2), together with the ellipsis question this deliberately
  leaves open.
- The endpoint kinds a context can be *created* with are a subset of the kinds that can be *listed
  and used*: the list and the "Use" action treat every kind alike.
- **Every cell of a row is the same number of lines whatever the context's state.** The description
  and Docker's error are the two values whose presence depends on it, and each is a column, where an
  absence costs the row no height.
- **A row's endpoint is truncated; the row's detail holds it in full**, wrapped and selectable
  (plan-ui-coherence-optimisation/REQ-21). Truncation is a presentation of the list, never the only
  presentation of the value.
- At most one detail is open on this screen, and at most one anywhere in the interface: the panel's
  own guarantee, not this screen's.
- Switching the active context announces itself exactly as before this screen was migrated: the same
  call, the same broadcast, the same toast. Nothing about when it fires or what it carries is this
  screen's to change.

## Decisions recorded

- **The eight-property daemon block was removed from this screen and is not to be restored**
  (plan-ui-coherence-optimisation/REQ-45). Docker version, Engine API, BuildKit, storage driver,
  cgroup driver, OS/arch, root directory and containers running were listed here *and* on System &
  prune. They describe **the daemon**, not **a context**: they do not change as the operator looks
  down this list, only when the active context changes — which makes them system information, and
  System & prune is the system screen. Nothing is lost: every one of the eight is readable there. A
  short summary of two or three of them on the active row is *permitted* by that requirement and was
  **declined**: this screen states what a context is and which one is in use, `useDaemonInfo` is no
  longer consumed here, and a partial copy is the same duplication in a smaller box.
- **The screen is one full-width list, not a pair of cards.** The delivered `Grid` template
  (`1.2fr 1fr`) never collapsed: at 375×812 it laid two cards side by side in a 335px content column,
  171.8px and 143.2px wide, leaving the list 105.8px to paint an endpoint in. It is gone rather than
  corrected with `Grid arrangement="pair"`, because its second child — the daemon card — is gone: one
  child is not a pair. The detail panel then gets the content column's full width, which is what
  REQ-23 requires and what a card of a pair could not give it.
- **"Use" is an action of the row's cluster, weighing `primary`.** It shipped as a clickable `Badge`
  — a real `<button>`, contrary to the "bare text" the analysis recorded, but painted as a neutral
  pill identical in box, radius and type scale to the green `active` pill beside it, distinguishable
  only by a hover fill. A statement and the most consequential click on the screen looked alike; now
  the statement is a marker in a column of its own and the switch is a button in the action cluster.
- The destructive action is labelled "Remove", not the mockup's `rm`: every other screen of the
  application uses "Remove" for the same action, and one shorthand label is not worth the divergence.
- The local-socket kind asks for nothing: the batch forbids any path input, so the endpoint is the
  default Docker socket of the machine running the server, stated in the form rather than typed.
- TLS is a column rather than the delivered `(tls)` suffix on the endpoint. The suffix rode on the
  value the row truncates first, so the fact most worth not losing was the first to be cut.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable (comfortable variant), TwoLineCell,
  MetaCell, BadgeListCell, StatusPill, ActionButtonGroup, DetailPanel, FormDialog, FormField,
  EndpointField, TextField, Button, Stack, EmptyState, ErrorBanner, useToast
- contexts: useContexts
- app-shell: useConfirmation, useProgress, useErrorReporter

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-ui-coherence-optimisation/REQ-42
- plan-ui-coherence-optimisation/REQ-43
- plan-ui-coherence-optimisation/REQ-44
- plan-ui-coherence-optimisation/REQ-45
- plan-ui-coherence-optimisation/REQ-21
