---
module: containers
component: ContainerDetailPanel
type: UI component
---

# ContainerDetailPanel

**Purpose** → the container detail, drawn as the body of the dialog the Containers screen opens from
a card's own control: the container's inspect data in an editable Config tab, the daemon's whole
inspect payload in a read-only Inspect tab, its logs, its live statistics, the processes running
inside it, and — for a running container — exec and attach interactive sessions. Rename and the
filesystem export both live on the card instead (REQ-21), not in this panel.

## Contract

- `<ContainerDetailPanel container onContainerReplaced />`
  - `container: ContainerSummary` — the container whose detail the dialog carries.
  - `onContainerReplaced: (newId: string) => void` — called after a recreate, since the original
    container id no longer exists.

Description:
- A `Tabs` row (Config, Inspect, Logs, Stats, Processes, and — only when the container is running —
  Exec, Attach) above the active tab's content, and nothing else. **Config is both the first tab of
  the row and the tab selected when the detail opens** — the tab drawn first and the tab opened on
  are the same one (REQ-11).
- **Inspect is second, immediately after Config**, and the remaining five follow in their present
  relative order (`inspect_full_payload/REQ-1`). This **supersedes the order clause** of
  `…-tabs_composition_refactor/REQ-11` — "the others follow Config in the order Logs, Stats,
  Processes, Inspect, Exec, Attach" — and nothing else of it: the same seven tabs are present, none
  added or removed, each carries the same uniform treatment, each shows what it showed before, and
  the tab active on open is Config as it was, so no stream and no session starts or stops starting
  because of the move.
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
- The container's `ContainerProcessesView`, handed the region itself rather than a document scroller
  inside it; the inspect data is neither needed nor awaited for it.
Shows (Exec tab):
- The container's `ContainerSessionView` with `kind="exec"`; the inspect data is neither needed nor
  awaited for it.
Shows (Attach tab):
- The container's `ContainerSessionView` with `kind="attach"`; the inspect data is neither needed
  nor awaited for it.
Shows (Config tab, view mode):
- **The reading is the edit form with its controls replaced by their values.** The same groups, in
  the same order, in the same containers and the same arrangement as `edit mode` below, all five
  drawn in both states — so the tab is one screen in two states, and pressing `Edit configuration`
  never asks the operator to re-find a setting they were just reading.
- **The "Edit configuration" action at the foot of the tab**, below every group and inside none of
  them, at the tab's trailing edge — the place the edit form's own save and cancel occupy (REQ-50).
  It scrolls with the tab's content, as that footer does, and is not pinned to the region. Its label
  and what it does are the delivered ones. **This amends REQ-22**, which put the action at the head:
  the head was chosen when the reading was two columns and the action had to belong to neither, and
  with the reading now the form's own composition the action takes the form's own place.
- **`Runtime` and `Health check` side by side**, each a `Card` of its own, in the library's named
  `pair` arrangement (`Grid arrangement="pair"`) — the two equal columns at desktop widths, stacking
  each at full width when the panel cannot carry both. `Environment variables`, `Port mappings` and
  `Mounts` follow underneath, one `Card` per row at full width.
- `Runtime` — a `DefinitionList` of restart policy (with its max-retry count where the policy is
  `on-failure`), CPU limit, memory limit and networks.
- `Health check` — the toggle, read: a quiet `Badge` in the heading's trailing slot saying `enabled`
  or `disabled`, and under it either the `DefinitionList` of command, interval, timeout, retries and
  start period, or the library's `EmptyState` saying the container defines no probe. The command is
  shown as the form's own single field holds it — without the `CMD` / `CMD-SHELL` token the daemon
  prefixes it with — and the durations in seconds, as the form asks for them, not in the nanoseconds
  the daemon reports.
- **`Environment variables`, `Port mappings` and `Mounts` are counted sections** (REQ-19, REQ-20),
  each headed by a `SectionHeader` carrying the number of entries it holds — a quiet `Badge` at the
  heading's trailing edge, the same reading the Inspect tab's own counted sections have. No entry
  carries a `mount:` prefix: the word that was repeated on every row is the section's heading.
  - `Environment variables` — **one variable per row, at the group's full width** (`FieldList`,
    free-text class), the key and the value each in a field of its own and each taking a half of the
    row: the form's own geometry, read (REQ-54). A value begins where its own field begins, never at
    a fixed offset inside an otherwise empty band, and the keys still read down as one column
    because every entry gives its first field the same share (REQ-18). The daemon's `KEY=value`
    string is split **on its first `=` only**, so a value that itself contains `=` arrives whole; an
    entry with no `=` at all is the key with an empty value.
  - `Port mappings` — one entry per port the container **publishes on the host, and only those**
    (`containers-service.md`, REQ-59), **each naming its two numbers** (`FieldList`, short-scalar
    class): `Container port` carrying the container's own port with its protocol, `Host port`
    carrying the host's — so which number is which is read rather than inferred from the order they
    are written in (REQ-55). The captions are the edit form's own words. The group goes on flowing
    **as many entries per line as its card carries**, which the human asked for explicitly. A
    publication whose host port the operator left to the daemon states the number the daemon chose,
    not `not published`; `not published` remains the reading for a binding the daemon carries with no
    host port at all. A port the container merely **exposes** is not an entry: it binds nothing on
    the host and is reachable from nowhere the operator asked for.
  - `Mounts` — **one mount per row, at the group's full width** (`FieldList`, free-text class,
    `content` arrangement): a `Source` field, a `Destination` field, and the `ro` / `rw` `Chip`
    beside the destination — the form's own row order, read, and the three parts REQ-21 asks for.
    The two fields share the row **by what they hold**, so a volume source — a path long enough to
    need most of a row — takes the room the destination beside it does not, instead of wrapping
    inside a fixed track while the rest of the row stands empty (REQ-56). The read-only chip carries
    the accent tone and the read-write one the neutral tone, so the mount an operator goes looking
    for when a container cannot write is told from its neighbours without reading either path.
- **Every group is drawn whether or not it holds anything**, count included, and a counted section
  with no entries says so in the library's `EmptyState`, asked for `compact`, in the place its list
  would occupy: `No environment variables`, `No port mappings`, `No mounts`. **This amends REQ-49**
  and supersedes `plan-ui-coherence-optimisation/REQ-60` **on this tab alone** (REQ-51): "this
  container publishes no port" is an answer the operator came for, and an absent group is not that
  answer — it is indistinguishable from a group that was never designed. The rule stands everywhere
  else, the Inspect tab's own collapsible sections below included, where a group is a disclosure the
  operator opens rather than a field they are looking for. `Runtime` and `Health check` were always
  drawn already, each stating a single setting whose "off" — no limit, no probe — is a value the
  operator chose.
- **The reading draws no control.** Every group is values on the page: a field of the reading has
  the form's geometry and none of its affordances — no input border, no focus ring, nothing to
  press. The one control on the tab is `Edit configuration` at its foot.
- `Environment variables` and `Mounts` declare the free-text class — one entry per row, at the
  group's full width — and `Port mappings` the short-scalar one, so it flows as many entries per
  line as its own card carries. The count follows the **card's** width and not the viewport's
  (`plan-docker_management_app-detail_property_columns`, bug-4).
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
- **The whole inspect payload, drawn as the payload's own shape** (`inspect_full_payload/REQ-3`):
  the library's `PayloadExplorer` over the inspect result's `raw` field — one section per composite
  top-level key of the daemon's response, one leading section gathering its top-level scalars, nested
  objects as groups, arrays as counted positional items, and a label → value band per leaf carrying
  the daemon's own key name. Every field the response holds is somewhere in the tab, keys the
  application has never heard of included, and a key the response does not carry is nowhere at all.
- **The delivered composition is gone entirely**: the `Identity` and `Lifecycle` groups, the ten
  curated properties, and the `Networks`, `Labels` and `Health` sections. This **supersedes**
  `…-tabs_composition_refactor/REQ-34` and REQ-35's own composition clause. **No summary block stands
  at the head of the tab**: the container's name, short id, state and health stay where the dialog's
  header already carries them, and each of the ten former properties is read in the section its own
  key belongs to, once (`inspect_full_payload/REQ-5`).
- **`plan-ui-coherence-optimisation/REQ-60` is deliberately not applied on this tab**
  (`inspect_full_payload/REQ-6`): a field the daemon sent is on screen whether or not it holds
  anything, marked as empty in its own place, because "this list is empty" is the answer the operator
  opened the tab for. `0` and `false` are values and are never marked empty. The rule stands
  everywhere else, this panel's Config tab included.
- **Exactly two sections are open when the tab is entered** — the gathered scalars and `State` — and
  every other one, the raw payload included, is closed (`inspect_full_payload/REQ-11`).
- **Values are read in the operator's terms beside the daemon's literal, never in place of it**
  (`inspect_full_payload/REQ-17`): the per-key reading is `container-inspect-reading.md`, and which
  key means what lives there and not in the library. `State.Status` still reads as **the state pill**
  in the state's own tone and a **non-zero exit code still carries the danger tone**, a zero one
  none — both from the module's one state reading (`container-status.md`), as REQ-35 and REQ-36
  required, now as values of the payload rather than as a curated band.
- **The raw payload is the last section of the tab**, after every payload-derived one, still titled
  `Raw payload` with a `JSON` summary and still closed on entry. This **supersedes the position
  clause** of `…-tabs_composition_refactor/REQ-37` and nothing else of it: opening it shows the whole
  payload, unaltered, as real selectable text in the library's code viewer (REQ-26, narrowed from
  *"copyable"* to *"selectable"* by `plan-docker_management_app-remove_copy_controls`/REQ-23), with no
  action of its own. While the tab's find holds text the section is not drawn: a filtered result holds
  the fields that matched and nothing else.
- **One find above the sections, and it filters** (`inspect_full_payload/REQ-19`): while it holds
  text only the matching fields are on screen, every section holding a match is open however deep the
  match sits, the number of matches is stated, and a search matching nothing says so instead of
  leaving a blank surface. Clearing it restores the whole payload and the entry section state.
- **The tab asks the daemon for nothing new** (`inspect_full_payload/REQ-25`): it renders the
  response the panel already had, whose `raw` field `containers-service.md` contracts as the full
  inspect payload exactly as received.
- The Config tab's own property sections go on stating **only their content class**, the number of
  columns following from each section's own width (`ui-library/content-columns.md`). The Inspect tab
  states none: its bands are the library's payload rendering, which sizes label and value against
  its own box and stacks them at the phone width.
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
- The Inspect tab's `Raw payload` section opens and closes on its own header, and its block offers no
  action of its own — no copy affordance, in either state: obtaining the full container id from it is
  a hand-selection inside the block, which
  `plan-docker_management_app-remove_copy_controls`/REQ-19 records as an accepted cost. What the
  header adds is one press before the block is on screen, and nothing else.
- Every other section of the Inspect tab opens and closes on its own header, and typing in the tab's
  find filters the payload. **No copy affordance is introduced anywhere on the tab**
  (`inspect_full_payload/REQ-24`): no copy button, no copy menu entry, no click-to-copy on a value —
  selection with mouse and keyboard remains the only route to any of them, the raw payload included.

## Rules and invariants

- **The panel's box does not follow its content.** The dialog carrying it asks for a stable height
  (`containers-screen.md`), so the frame is the same one before and after a change of tab, for any
  pair of tabs and whatever either holds, and the same one before and after a reveal inside a tab —
  the Config health-check switch included. What changes when a tab is changed is what is drawn inside
  the region, never where the region is.
- **A tab taller than the region scrolls inside the region**, never outside the card and never on the
  page behind it: the tab row and the dialog's own chrome stay put and every tab stays reachable
  however long the active one is. A tab that is a document (Config, Stats, Inspect) scrolls
  as one; a tab that is a surface of its own (Logs, Processes, Exec, Attach) fills the region and
  scrolls inside itself. **Processes moved from the first group to the second**: its table takes the
  region's height and scrolls and virtualises inside itself, which a tab wrapped in a document
  scroller could not do — inside one it is offered no definite height at all
  (`container-processes-view.md`).
- **A tab that is a document is given the region with room in it** (REQ-53): Config, Stats and
  Inspect ask the library's scrolled region for its named `inset`
  (`ui-library/specs/scroll-area.md`), so a `Card` at the region's edge draws the whole of its drop
  shadow instead of having it clipped, and the scrollbar keeps a gutter of its own instead of resting
  on the cards' trailing edge. The room is the library's, asked for by name; the panel states no
  value for it. The tabs that are surfaces of their own — Logs, Processes, Exec, Attach — take the
  region as it is, and so does every other consumer of that region in the application.
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
  above, and the raw payload as real selectable text — which a section closed on arrival does not
  withdraw: the payload is the same text, in full and still selectable by hand, once its own section
  is open (REQ-37). What its Logs and Stats tabs draw was
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
- **The inspect data follows the container while a tab showing it is open**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-26,
  …-client_event_refresh_removal/REQ-28): the panel tells `useContainerDetail` whether the active tab
  is Config or Inspect, and on any other tab the reading is not taken at all. Switching to either of
  the two reads at once, so the tab opens on what is true now instead of on what was true when the
  detail was opened, and the dialog's header and its payload never describe two different moments
  (…-client_event_refresh_removal/REQ-25). The Processes tab is scoped by its own view's mount
  (`container-processes-view.md`); Logs, Stats, Exec and Attach are untouched and keep the streams
  and the sessions they have (…-client_event_refresh_removal/REQ-36).
- **A tick disturbs nothing on the tab it refreshes**
  (…-client_event_refresh_removal/REQ-29, …-client_event_refresh_removal/REQ-30): a reading equal to
  the one held replaces nothing at all, and a reading that differs replaces the values where they
  stand. No tab content is remounted by a re-read, the Inspect tab's open sections and its find are
  the payload explorer's own state and survive a new payload, and nothing is closed, collapsed or
  reset.
- **An edit in progress is never rebuilt under the operator**
  (…-client_event_refresh_removal/REQ-31): the form is seeded once, from the data of the moment
  "Edit configuration" is pressed, and no later read replaces a value typed into it. Only switching
  `container` discards it.
- **Nothing on the detail says its data is on a clock**
  (…-client_event_refresh_removal/REQ-35): no indicator, no "last updated", no control and no
  setting; the Processes tab keeps the refresh control it already offers.
- **No failure panel** (plan-docker_management_app-inline_error_panels/REQ-1): a failed inspect read
  is reported as one toast through `useFailureReport`, and where it leaves nothing to show the
  shared "could not be loaded" placeholder stands where the Config and Inspect tabs draw their data
  — no cause named, no control (…/REQ-3). The retry is the header's; none is offered here (…/REQ-4).

## Dependencies

- ContainerLogsView
- ContainerStatsView
- ContainerProcessesView
- ContainerSessionView
- Container inspect reading (`container-inspect-reading.md`)
- ui-library: BandStack, ScrollArea, Tabs, PayloadExplorer, DefinitionList, FieldList, Badge, Card, Chip, CollapsibleSection, CodeViewer, Grid, Select, NumberField,
  Toggle, TextField, KeyValueEditor, RepeatableRowList, FormFooter, SectionHeader, Row, Spacer, Stack,
  Button, EmptyState, useToast
- Containers client (updateContainerConfig)
- useContainerDetail
- app-shell: ConfirmationService, ProgressService, ErrorReportingService, useFailureReport,
  FailedReadEmptyState

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
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-32
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-34
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-35
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-36
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-37
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-46
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-47
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-48
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-50
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-51
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-53
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-54
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-55
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-56
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-1
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-2
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-3
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-4
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-5
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-6
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-11
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-12
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-15
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-16
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-17
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-19
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-20
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-21
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-22
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-24
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-25
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-26
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-27
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-29
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-35
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-26
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-30
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-31
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-35
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-36
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-3
- plan-docker_management_app-inline_error_panels/REQ-4
