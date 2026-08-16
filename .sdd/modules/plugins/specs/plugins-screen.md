---
module: plugins
component: PluginsScreen
type: UI component
---

# PluginsScreen

**Purpose** → the plugins of the active installation: the CLI sub-commands Docker ships next to the
drivers the daemon runs, with everything needed to install, enable, disable, inspect and remove a
daemon one.

## Contract

Description:
- two object lists, one under the other, each at the full width of the content column: "CLI plugins"
  first, "Daemon plugins" below it with the screen's only page-level action in its toolbar.
- the CLI list scrolls within the screen once it is taller than 60% of the viewport; the daemon list
  is as tall as its rows.

Shows:
- CLI list — one row per CLI plugin, in columns: the invocation (`docker compose`), its version, its
  availability as a badge reading `enabled`, `available` or `unavailable`, and the reason the
  installation refuses to run it.
  - every row is one line tall, whatever the plugin's state, and every column keeps its left edge on
    every row — the availability badge included, whatever the length of that row's version string.
  - a plugin the installation reports no version for reads "unavailable" in the version's place,
    with the reason on hover.
  - a plugin the installation runs has nothing to explain, and its reason column reads "–".
- Daemon list — one row per daemon plugin, in columns: the plugin's name, its description, the
  interface it implements in words ("log driver", "volume driver", …), a badge reading
  `enabled`/`disabled`, the switch that changes that state, and the row's actions.
  - every row is one line tall here too: a plugin without a description costs the row no height.
- Either list with nothing to show states it on the empty-result surface, with a title and one line:
  the installation's or the daemon's own reason where the reading came with one, and otherwise what
  that inventory holds and how it comes to hold something.
- A failed reading shows the failure with a retry, without hiding the lists.

Actions:
- "Install plugin" (daemon-plugins toolbar) and "Install the first plugin" (the empty state's own
  action, offered only where the daemon states no reason of its own) → the same form, asking for the
  reference and an optional alias, plus a switch for
  enabling it once installed (on by default). Submitting **installs nothing**: it reads the
  privileges the reference asks for and opens the confirmation that shows them.
- The privilege confirmation lists every privilege with its value and asks for an explicit grant;
  granting installs, cancelling installs nothing and gives the form back with what was typed in it.
  A successful install is announced, saying whether the plugin was left enabled or disabled.
- A reference asking for nothing says so in the dialog and still has to be granted. A reference
  nobody publishes reads the same way — the daemon cannot tell the two apart before the pull — and
  the install that follows the grant then fails with the daemon's own message, having installed
  nothing.
- The empty daemon list offers the same install as its resolving action — except where the daemon
  itself stated a reason, that reason being that it exposes no managed plugin at all, which
  installing one would not resolve.
- the row's switch → enables or disables the plugin; it stays on the value that is still true and
  shows itself busy until the daemon confirms.
- "Inspect" → opens the plugin's full reading under its row, on the detail panel, at the list's full
  width: its properties (name, id, reference, interfaces, state, mounts, devices, capabilities,
  documentation) and the daemon's own document below them. Pressing "Hide" closes it, and so does
  `Escape`; the panel offers no close control of its own.
- "Remove" → asks for a destructive confirmation naming the plugin and stating that its data goes
  with it and that an enabled plugin must be disabled first; once confirmed the plugin disappears
  from the list, and its open inspection closes with it.
- Every failure — install, enable, disable, remove — is reported with the daemon's own message, and
  leaves the list showing what is actually true.

## Rules and invariants

- **The toolbar's action and the empty state's are two controls, and neither name contains the
  other.** Both open the same flow, and while the list is empty both are on screen at once — the
  toolbar because a page-level action lives there (plan-ui-coherence-optimisation/REQ-41), the empty
  state's because an empty result states the way out of itself
  (plan-docker_management_app/REQ-25). A name that is a prefix of another's is the same name to
  anything that finds a control by name, so the empty state takes the invitation and never the
  toolbar's own word with a suffix; identical labels are not the repair, they are the same collision.
  Reasoned out once, with the deferred ellipsis question, in `swarm/specs/swarm-secrets-panel.md`
  (DEF-2).
- Nothing is installed by a single click: the privileges are always shown, and only an explicit
  grant installs (REQ-99). Cancelling the grant installs nothing.
- Removal is the only destructive action here and always goes through the confirmation; enabling
  and disabling do not, being reversible by the same switch.
- The two lists are one reading: they are never seen showing two different moments of the same
  installation.
- The CLI list is read-only — those plugins are files the operator installs themselves — and it
  keeps answering while the daemon is unreachable. Its empty state therefore offers no action.
- A value whose presence depends on the plugin's state is a column, never a second line of a row: a
  row is one line tall whether or not the installation refuses to run the plugin and whether or not
  the daemon describes it.
- The state is stated once per row as a badge and changed by the switch beside it: what states is
  drawn as a statement, what changes is drawn as a control.
- At most one inspection is open, in this list and in the interface, the detail panel holding that
  guarantee.

## Decisions recorded

- **The side-by-side pair is gone rather than collapsed**
  (plan-ui-coherence-optimisation/REQ-46). `Grid columns="1fr 1fr"` never collapsed, so at 375×812
  each list drew in 157.5px and every version string ran 35.2px past its own card — 103.8px on the
  `v0.36.0-desktop.1` row, 83.8px of it across the other card. Collapsing that template would have
  repaired the phone alone: the inspection is the row's own expansion, so a list's width **is** the
  panel's width, and the pair capped the daemon plugin's raw document at 442px of a 1120px content
  column at 1440×1000, 362px at 1280×800, and drew it 12.5px off the left edge of the viewport at
  375×812, 89.5px wide. Stacked, that document measures 1012 / 852 / 229px. This is batch 6's
  argument on volumes and networks, not a new one.
- **The CLI list keeps the first position and is capped at 60% of the viewport height.** Stacking
  the longer, read-only inventory above the list that carries every action on this screen pushes
  that list down by its own height: 1038px of CLI rows on a stock installation. The cap is the
  height containers and images already use for a long list, and it recovers 438px of that — the
  daemon card's heading lands at y=925 of a 1000px viewport at 1440×1000, and still below the fold
  at 1280×800 (y=805) and 375×812 (y=924).

  **The order was examined and kept, and the deciding argument is not the order.** The install lives
  in the screen's toolbar, not in a row, so **the only thing an operator comes here to *do* is above
  the fold at every viewport whatever order the lists take** — which leaves the daemon list's
  position a question about *reading* rather than about reach. Read that way it settles itself: a
  typical installation ships fifteen CLI plugins and **no** daemon plugin, so leading with the
  daemon list would open the screen on an empty state, and a screen that opens on nothing reads as
  broken. Reversing it is a one-line change, but it would be paid for by every operator on every
  visit to buy back a scroll on the rarer act.
- **The leading state dot is gone from both lists, and that is a decision rather than a tidy-up.**
  It said in colour what the badge column beside it now says in colour **and** in words, on every
  row; it survived only because the delivered card carried the badge and the version in one trailing
  group, where a state column did not exist. Batch 7 found that `StatusDotCell`'s dot is an empty
  element whose tone reaches the DOM as a class name setting a background — no `aria-label`, no
  role, no hidden text — so a state carried by the dot alone is unreachable by assistive technology,
  and left batch 19 the choice between *the dot names its tone* and *a cell carrying state alone
  says it in words*. This screen takes the second, for its own reason (REQ-27's neighbourhood: what
  states is drawn as a statement, and stating it twice is stating it once too often).

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable (comfortable variant) with TwoLineCell,
  MetaCell and BadgeListCell, DetailPanel, CodeViewer, Button, Toggle, ActionButtonGroup, FormDialog,
  FormField, TextField, ErrorBanner, EmptyState, Stack, useToast
- plugins: usePlugins
- app-shell: ConfirmationService (`confirm`, `confirmPrivileges`), ErrorReportingService,
  ProgressService

## Requirements served

- plan-docker_management_app/REQ-98
- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
- plan-ui-coherence-optimisation/REQ-46
- plan-ui-coherence-optimisation/REQ-47
- plan-ui-coherence-optimisation/REQ-48
