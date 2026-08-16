---
module: compose
component: ComposeScreen
type: UI component
---

# ComposeScreen

**Purpose** → the Compose screen: every discovered project with its per-service state, up/down/
restart and per-service replica scaling, the selected project's compose file(s) — editable,
validated on demand, saved back to disk after confirmation — and its aggregated live logs labelled
per service.

## Contract

- `<ComposeScreen projects loaded error? onRefresh />`

Description:

- one full-width list of projects, in the object list's comfortable variant, and nothing beside it.
  Each project row carries its services as a nested header-less list of the same component, so the
  grouping is the object's own shape rather than a second list component; the selected project's
  detail is revealed below its row, at the content column's full width.

Shows:

- one row per project, in the order the discovery service returns (name order), with: the project
  name, its state (`Up` / `Partial` / `Down` / `Unknown`, in a tone and in words), how many of its
  services are running, its discovered compose file path(s), and the daemon's own message where the
  project could not be read (`–` where there is none).
- inside every project row, opened or not: one row per service (name order) with its name, the
  daemon's own word for its state, its image and its replicas `Stepper`.
- for the selected project, in the detail panel: its properties in the library's grid (project,
  state, services running, compose files, and the daemon's message where there is one), over two
  views of it —
  - `Compose file` → the file in a `CodeEditor`, tabbed by file name when the project has several,
    with the dirty indicator and a validation summary line once validated (valid: file name,
    service/volume/network counts; invalid: the daemon's own error);
  - `Aggregated logs` → the project's live logs in a `LogStream`, each line labelled with its
    service, with the download of the displayed buffer.
- with no project discovered: the empty state's title, the line stating what puts a project there,
  and the action that re-reads the daemon.

Actions:

- "Restart" (row) → restarts the project's stack.
- "Up" (stopped/unknown project) → brings the stack up; "Down" (running/partial project) → asks for
  confirmation, then brings it down.
- a service's replicas `Stepper` → scales that service to the chosen count, without selecting the
  project.
- selecting a project's row → reveals that project's detail panel; selecting it again, or `Escape`,
  closes it (asking first while the compose buffer is dirty).
- "Validate" (compose file view) → validates the selected project's file(s) on demand.
- "Save" (compose file view, enabled only while the active file is dirty) → asks for confirmation,
  then writes the active file back to disk.
- "Check again" (empty state) → re-reads the project list.

## Rules and invariants

- No path is ever entered by the operator anywhere on this screen: every path shown is discovered
  from the daemon's own compose labels.
- Switching the selected project, or closing its panel, discards any unsaved edit of the previously
  selected one's file — and **never without asking**: while the buffer is dirty, every route that
  would discard it (the panel's `Escape`, the row that closes it, another project's row) confirms
  first, and a refused confirmation leaves both the panel and the edit standing.
- The aggregated log stream is subscribed only while a project's panel is open.
- Every cell of a project row is the same number of lines whatever the project's state: the
  discovered file paths and the daemon's refusal to read the project are columns of their own, not a
  shared subtitle line, so a project that carries neither costs its row no height. Measured: 59.4px
  on every project row and 56px on every service row, at 1440×1000, 1280×800 and 375×812.
- One project's detail is open at a time, which is the list's own guarantee (one `expandedRowKey`)
  and `DetailPanel`'s across the interface.
- Nothing on this screen is laid out beside anything else: the panel is the content column's width
  (1012 / 852 / 229px measured), and so are the editor and the log stream inside it.

## Decisions recorded

- **`GroupedRowsPanel` leaves the product with this migration** (plan-ui-coherence-optimisation/
  REQ-49). This screen was its only call site. The grouping survives as `renderRowContent` holding a
  nested `hideHeader` comfortable list, which is the composition the retirement was recorded against
  in batch 5: one list rendering both levels, sharing the row rendering, the column contract, the
  action cluster and the truncation contract instead of duplicating them.
- **The side-by-side pair is deleted rather than collapsed.** `Grid columns="2fr 1fr"` never
  collapsed; measured on the delivered build at 375×812 it laid a 210px column beside a **105px**
  one, in which the compose editor painted **39px** wide, the log stream 39px, and the two empty
  states 50px with their titles wrapping to three and four lines and overflowing their own box. The
  one-prop fix (`arrangement="pair"`) would have repaired the phone and left the panel at a third of
  the screen; the deciding reason is that the column's two regions are now **views of the selected
  project inside its panel**, so the pair has one child and is not a pair.
- **The panel is dismissed exactly as every other panel in the product is** — the row that opened it
  closes it, `Escape` closes it, no close control — and **the editable buffer is guarded by a
  confirmation instead of by a dismissal of this screen's own**. The risk is real (`Escape` is an
  unremarkable keystroke to type in a textarea, and closing discards the edit), but a bespoke control
  here would be a second answer to "how is a panel dismissed" on one screen out of six, which is the
  divergence this plan exists to remove. So: `Escape` and the row close the panel as everywhere else,
  and while the compose buffer is dirty either route asks first, through the confirmation service the
  product already uses for anything that destroys work. **It needed nothing from the library**:
  `DetailPanel` never closes itself — it calls `onClose` and the screen owns the state — so a panel
  that may refuse to close is already expressible, and `detail-panel.md` needs no exception.
  Measured at 1440×1000 and 375×812: clean buffer + `Escape` → panel closed; dirty buffer + `Escape`
  → confirmation shown, panel still open; `Cancel` → panel open with the edit intact; `Discard
  changes` → panel closed. The same guard on the row that switches project and on the row that closes
  the open one.
- **No project is selected when the screen opens**, where the delivered screen selected the first one
  so that its permanently visible right column had something to draw. Two reasons: the detail is now
  *revealed* by a gesture (REQ-50), and — the stronger one — the product no longer streams a
  project's aggregated logs that nobody asked to see. The subscription begins when a project's panel
  is opened and ends when it closes.
- **The row-level `Validate` is gone.** It existed because the file lived in a column permanently
  beside the list; with the file inside the project's own panel it was a second route to a control
  one click away. Validation, its summary line and its on-demand nature are unchanged in the panel.
- **The `Unsaved` badge in the editor card's header is gone**, the card's header having gone with the
  column. `CodeEditor`'s own dirty indicator states the same fact, once.
- **The log stream is never offered without a download filename any more.** It exists only inside a
  project's panel, so the "no project selected" state it used to be drawn in — the product's one case
  of a stream whose action row renders nothing at all
  (plan-docker_management_app-remove_copy_controls/REQ-12) — no longer arises on this screen. The
  component's behaviour is unchanged and still contracted in `log-stream.md`.

## Dependencies

- ui-library: DataTable, DetailPanel, ActionButtonGroup, TwoLineCell, MetaCell, BadgeListCell,
  CodeEditor, Stepper, LogStream, Tabs, Badge, Button, ErrorBanner, EmptyState, Card, SectionHeader,
  Stack, Row
- compose: useComposeFile, useComposeLifecycle, useComposeLogs
- app-shell: ConfirmationService, ErrorReportingService, Toast

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-78
- plan-ui-coherence-optimisation/REQ-49
- plan-ui-coherence-optimisation/REQ-50
- plan-ui-coherence-optimisation/REQ-51
