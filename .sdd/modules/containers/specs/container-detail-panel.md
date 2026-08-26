---
module: containers
component: ContainerDetailPanel
type: UI component
---

# ContainerDetailPanel

**Purpose** → the container detail, drawn as the body of the dialog the Containers screen opens from
a card's own control: the container's logs, its live statistics, its inspect data in an editable
Config tab, the processes running inside it, the read-only Inspect tab with the raw payload, and —
for a running container — exec and attach interactive sessions. Rename and the filesystem export
both live on the card instead (REQ-21), not in this panel.

## Contract

- `<ContainerDetailPanel container onContainerReplaced />`
  - `container: ContainerSummary` — the container whose detail the dialog carries.
  - `onContainerReplaced: (newId: string) => void` — called after a recreate, since the original
    container id no longer exists.

Description:
- A `Tabs` row (Config, Logs, Stats, Processes, Inspect, and — only when the container is running —
  Exec, Attach) above the active tab's content, and nothing else. **Config is both the first tab of
  the row and the tab selected when the detail opens** — the tab drawn first and the tab opened on
  are the same one (REQ-11).
- **Every tab presented is drawn alike, with only the active one distinguished** (REQ-12). On a
  running container the seven carry one treatment: Exec and Attach are not disabled, dimmed, ghosted
  or otherwise set apart from the other five. Being running-only decides a tab's presence in the row,
  never its presentation.
- The interior is the library's **band arrangement** (`ui-library/specs/band-stack.md`): the tab row
  is a band, at the height of its own content, and the active tab's content is the one region that
  absorbs whatever height is left. That is also what makes the dialog hand its bounded height down,
  by the gate `ui-library/specs/modal.md` documents.
- **It is a body and not a surface**: no surface of its own, no header, no title, no header actions,
  no close control and no dismissal route. The container's identity, the chrome and both ways out
  are the dialog's (`ui-library/specs/modal.md`, `containers-screen.md`). "Export filesystem…" was
  this panel's only action and is started from the card's overflow menu.
- It takes the whole width **and the whole height** of the dialog body it is placed in, and states no
  width, height or minimum of its own.
Dismissal:
- The panel offers none and claims no key. It ends when the dialog that holds it does, by either of
  the dialog's two routes — its close control, or a click on the dimmed area.
- `Escape` dismisses nothing while the dialog stands
  (`plan-docker_management_app-containers_card_view-detail_modal/REQ-11`), and an `Escape` typed into
  a live Exec or Attach session goes to the session, which stays live. This **supersedes**
  `plan-docker_management_app-container_detail_close/REQ-5`, which had the key close this panel: the
  panel is no longer a dismissible surface, and the dialog carrying it deliberately does nothing with
  the key.
Shows (Logs tab):
- The container's `ContainerLogsView`; the inspect data is neither needed nor awaited for it.
Shows (Stats tab):
- The container's `ContainerStatsView`; the inspect data is neither needed nor awaited for it.
Shows (Processes tab):
- The container's `ContainerProcessesView`; the inspect data is neither needed nor awaited for it.
Shows (Exec tab):
- The container's `ContainerSessionView` with `kind="exec"`; the inspect data is neither needed nor
  awaited for it.
Shows (Attach tab):
- The container's `ContainerSessionView` with `kind="attach"`; the inspect data is neither needed
  nor awaited for it.
Shows (Config tab, view mode):
- **The "Edit configuration" action at the head of the tab**, above both columns and inside neither
  (REQ-22), at the tab's trailing edge. Its label and what it does are the delivered ones.
- Under it, two columns in the library's named `pair` arrangement (`Grid arrangement="pair"`), so
  they are the mocked two equal columns at desktop widths and **stack, each at full width**, when the
  panel cannot carry both — instead of each being squeezed to ~180px.
- Left: a `Runtime configuration` heading over a `DefinitionList` of restart policy, CPU limit,
  memory limit, port mapping, health check command and networks.
- Right: **two counted sections of their own**, `Environment` and `Mounts` (REQ-19, REQ-20), each
  headed by a `SectionHeader` carrying the number of entries it holds — a quiet `Badge` at the
  heading's trailing edge, the same reading the Inspect tab's own counted sections have. No entry
  carries a `mount:` prefix: the word that was repeated on every row is the section's heading.
  - `Environment` — one band per variable, its **key and its value on two aligned tracks**
    (`DefinitionList arrangement="key-columns"`), so the keys read down as one column and every
    value begins at one edge (REQ-18). The daemon's `KEY=value` string is split **on its first `=` only**,
    so a value that itself contains `=` arrives whole; an entry with no `=` at all is the key with an
    empty value.
  - `Mounts` — one band per mount, its **source as the band's label, its destination as the value,
    and a `ro` / `rw` `Chip` beside it** (REQ-21). The read-only chip carries the accent tone and the
    read-write one the neutral tone, so the mount an operator goes looking for when a container
    cannot write is told from its neighbours without reading either path.
- **A section with no entries is not drawn at all** — neither its heading nor its list: a heading
  counting `0` is present-and-empty, which `plan-ui-coherence-optimisation/REQ-60` refuses and the
  Inspect tab below already refuses. A container with neither environment nor mounts therefore shows
  the runtime column alone, and nothing occupies the other side.
- Both right-hand sections declare the long-single-line class, so each flows as many bands per line
  as its own column carries and the two — being of one measured width — show the same count as each
  other.
Shows (Config tab, edit mode):
- **Five groups, each inside a container of its own** (REQ-23) — `Runtime`, `Health check`,
  `Environment variables`, `Port mappings` and `Mounts` — instead of five headings on one continuous
  ground. Each is a `Card` holding its own `SectionHeader` and its own fields; `Port mappings` and
  `Mounts` are treated exactly like the three the mock draws, so no group is left on the old ground.
- **`Runtime` and `Health check` side by side** (REQ-24), in the library's named `pair` arrangement
  (`Grid arrangement="pair"`) — the same one the reading view uses — so the two small groups stack,
  each at full width, when the dialog cannot carry both. `Environment variables`, `Port mappings` and
  `Mounts` follow underneath, one per row, at full width.
- `Runtime` — restart policy (select) with a max-retries field shown only for `on-failure`, and the
  CPU and memory limit fields.
- `Health check` — the `Enabled` toggle, revealing the command, interval, timeout, retries and
  start-period fields when it is on. Revealing them moves no edge of the dialog (REQ-2): the group
  grows inside the tab's scrolled document, which the stable height already bounds.
- `Environment variables` — the key/value editor. `Port mappings` — the repeatable row list of
  container port, protocol and host port. `Mounts` — the repeatable row list of source, destination
  and read-only.
- A form footer (save/cancel, dirty indicator) closing the column, **stating for the whole time the
  form is in editing that Environment and Mounts changes require the container to be recreated**
  (REQ-25). The statement is present from the moment the form opens: it says what *would* cost a
  recreate, and is not conditional on either group having been touched. It is a statement and not a
  question — nothing about the save is decided on it.
Shows (Inspect tab):
- A `DefinitionList` of id, name, image, command, entrypoint, created date, state, started/finished
  dates and exit code; collapsible sections for networks, labels and (when the container defines a
  health check) the latest health status/failing streak/log entries; the raw inspect payload as
  formatted JSON, shown in full as real selectable text in a scroll area (REQ-26, narrowed from
  *"copyable"* to *"selectable"* on 2026-08-14 by
  `plan-docker_management_app-remove_copy_controls`/REQ-23).
- **A collapsible section with nothing in it is not drawn** (`plan-ui-coherence-optimisation/REQ-60`,
  one rule shared with `images/specs/image-detail-panel.md`): `Networks` and `Labels` appear only
  when they hold at least one entry, so a section headed with a count of `0` — which the delivered
  build drew for `Labels` on every container declaring none — cannot occur. `Health` was already
  conditional on the container defining one. A section that has content is unchanged, count
  included.
- Each property section states **only its content class**: the ten properties, `Networks`, `Health`
  and the Config tab's runtime configuration take the default short scalar, `Labels` declares long
  single-line. The number of columns each shows follows from that section's own width
  (`ui-library/content-columns.md`), so the Config tab's half-width list and the Inspect tab's
  full-width one differ on the same screen at the same instant.
Actions:
- "Edit configuration" switches the Config tab to edit mode, seeded from the current inspect data.
- Saving computes which fields changed since edit mode was entered (REQ-25):
  - only restart policy and/or resource limits changed → applied directly, no warning.
  - env, ports, mounts or health check changed → the operator is asked to confirm a recreate first
    (via the shell's confirmation service, naming the container and stating the consequence);
    declining leaves the container and its configuration unchanged. **The footer's standing statement
    does not replace this confirmation** (REQ-26): the operator is still asked, explicitly, before the
    container is stopped, removed and recreated, and refusing there still abandons the save. The
    footer says it earlier as well, not instead.
  - the outcome (`in-place` or `recreate`) is reported via a toast; on `recreate`,
    `onContainerReplaced` is called with the new container id and the panel returns to view mode
    showing the new container's data; on `in-place`, the panel re-reads the same container.
  - a failure reports the daemon's own message via the shell's error-reporting service and leaves
    edit mode open with the operator's input intact.
- "Cancel" (form footer) discards the in-progress edit and returns to view mode without contacting
  the server.
- The Inspect tab's payload block offers no action of its own: obtaining the full container id from
  it is a hand-selection inside the block, which
  `plan-docker_management_app-remove_copy_controls`/REQ-19 records as an accepted cost.

## Rules and invariants

- **The panel's box does not follow its content.** The dialog carrying it asks for a stable height
  (`containers-screen.md`), so the frame is the same one before and after a change of tab, for any
  pair of tabs and whatever either holds, and the same one before and after a reveal inside a tab —
  the Config health-check switch included. What changes when a tab is changed is what is drawn inside
  the region, never where the region is.
- **A tab taller than the region scrolls inside the region**, never outside the card and never on the
  page behind it: the tab row and the dialog's own chrome stay put and every tab stays reachable
  however long the active one is. A tab that is a document (Config, Stats, Processes, Inspect) scrolls
  as one; a tab that is a surface of its own (Logs, Exec, Attach) fills the region and scrolls inside
  itself.
- Only the active tab's content exists: leaving the Stats tab (switching tab, or the dialog being
  dismissed by either route) unmounts the stats view and thereby stops the live stats stream
  (REQ-32); leaving the Exec or Attach tab likewise closes the interactive session (REQ-36). Nothing
  the panel owns — stats stream, log stream, exec or attach session — outlives the dialog, and
  opening and closing detail after detail accumulates none of them.
- Switching `container` (a different container's detail opened) resets edit mode and any in-progress
  edit.
- The Exec and Attach tabs are only offered for a running container.
- **The file states no column count, no track template, no width, no `style` and no CSS import** —
  the editing form included: its groups are the library's `Card`, and its two-column head is the
  library's named `pair` arrangement, so the file asks for shapes and never for tracks.
- The save action is disabled while there is nothing to save (no field differs from the value edit
  mode was seeded with) and while a save is in flight.
- **The panel is the primitive, and the three things it must not lose are named**
  (`plan-ui-coherence-optimisation/REQ-65`): the seven tabs above, the two-column property grid
  above, and the raw payload as real selectable text. What its Logs and Stats tabs draw was
  rearranged by REQ-62…REQ-64 (`container-logs-view.md`, `container-stats-view.md`); the panel itself
  is unchanged by that, and so are the certified behaviours reaching into it — bug-1's progress
  dialog on a recreate, bug-4's rule that two property sections of the same measured width show the
  same number of columns, and bug-5's absence of every copy affordance.
- **Moving onto the dialog surface changed where the detail is drawn and nothing else**
  (`plan-docker_management_app-containers_card_view-detail_modal/REQ-4`): the same seven tabs in the
  same order, the same tab active on open, the same data, operations, confirmations and live
  behaviour. That content parity is **superseded twice**, each time in one clause only, by
  `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor`: "no view
  inside it re-sized" no longer holds — the log region and the terminal now take the height of the
  region they are placed in — and neither does "the same order", Config having moved to the head of
  the row by REQ-11. **The tab active on open is not one of the two**: it was Config before that move
  and it is Config after it, so no stream and no session starts, or stops starting, when the detail
  opens. Everything else the requirement fixed stands, and any observable difference in data,
  operations, confirmations or live behaviour is still a defect.

## Dependencies

- ContainerLogsView
- ContainerStatsView
- ContainerProcessesView
- ContainerSessionView
- ui-library: BandStack, ScrollArea, Tabs, DefinitionList, Badge, Card, Chip, CollapsibleSection, CodeViewer, Grid, Select, NumberField,
  Toggle, TextField, KeyValueEditor, RepeatableRowList, FormFooter, SectionHeader, Row, Spacer, Stack,
  Button, ErrorBanner, EmptyState, useToast
- Containers client (updateContainerConfig)
- useContainerDetail
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-32
- plan-docker_management_app/REQ-33
- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
- plan-docker_management_app-container_row_actions/REQ-19
- plan-docker_management_app-container_row_actions/REQ-21
- plan-docker_management_app-container_detail_close/REQ-1
- plan-docker_management_app-container_detail_close/REQ-2
- plan-docker_management_app-container_detail_close/REQ-14
- plan-docker_management_app-container_detail_close/REQ-17
- plan-docker_management_app-detail_property_columns/REQ-6
- plan-docker_management_app-detail_property_columns/REQ-17
- plan-docker_management_app-detail_property_columns/REQ-18
- plan-docker_management_app-detail_property_columns/REQ-19
- plan-docker_management_app-detail_property_columns/REQ-22
- plan-docker_management_app-detail_property_columns/REQ-27
- plan-docker_management_app-detail_property_columns/REQ-31
- plan-docker_management_app-detail_property_columns/REQ-34
- plan-ui-coherence-optimisation/REQ-60
- plan-ui-coherence-optimisation/REQ-65
- plan-docker_management_app-containers_card_view-detail_modal/REQ-4
- plan-docker_management_app-containers_card_view-detail_modal/REQ-23
- plan-docker_management_app-containers_card_view-detail_modal/REQ-24
- plan-docker_management_app-containers_card_view-detail_modal/REQ-30
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-1
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-3
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-11
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-12
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-18
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-19
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-20
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-21
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-22
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-23
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-24
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-25
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-26
