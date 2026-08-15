---
module: images
component: ImagesScreen
type: UI component
---

# ImagesScreen

**Purpose** → the Images screen: every local image, registry-facing actions, and per-layer progress
for pull/push.

## Contract

- `<ImagesScreen images loaded error? onRefresh />` — `images: ImageSummary[]`, `onRefresh: () =>
  void` re-reads the list (the caller, the Shell, owns `useImages()`).

Description:
- A `ScreenToolbar` with a "Pull image…" primary action, "Load tarball…" and "Import filesystem…"
  secondary actions, a "Prune dangling" destructive action, and a search filter — above an optional
  `BulkActionBar`
  (shown once at least one row is multi-selected) and a `DataTable` of every image matching the
  current search, laid out exactly like the containers table (same header row, row height,
  typography, hover and selected treatment), with a leading multi-select checkbox column.
Shows:
- A header row and one row per matching image, in these columns: a leading status dot (green when
  the image has at least one tag, amber when it is dangling), `REPOSITORY:TAG` — **every tag the
  image carries, stated once**, over the short id, `DIGEST` — the repository digest, cut to a short
  identifier, `PLATFORM`, `DISK USAGE` (right-aligned), `CREATED` — the age, and `ACTIONS`.
- **A row prints its reference once.** The reference column and a second column of tag pills carried
  the identical string on every row of the delivered build (`alpine:3.20` beside a pill reading
  `alpine:3.20`); the pills are gone and the reference column carries the whole tag list, so a
  multi-tagged image still shows all of its tags and a single-tagged one states its tag once
  (`plan-ui-coherence-optimisation/REQ-57`). A dangling image reads `<none>` there, and is marked as
  dangling by the leading status dot — which is where that fact already was.
- **`DIGEST` shows a repository digest or nothing at all.** It never falls back to the image id, and
  it is empty (the column's own `–`) when the daemon reports no repository digest, or reports one
  that *is* the image id — which a containerd-backed daemon does, `RepoDigests` and `Id` carrying the
  same digest there. A column showing one field's value under another field's name is the defect
  `plan-ui-coherence-optimisation/REQ-58` names, and the row's short id already states that value.
- **`DISK USAGE`, not `SIZE`**: the size the daemon reports for the image in its **listing**
  (`GET /images/json` → `Size`), which on a containerd-backed daemon counts the image's content
  *and* its unpacked snapshots. The panel states a different measurement under a different name
  (`image-detail-panel.md`), so no single word carries two numbers
  (`plan-ui-coherence-optimisation/REQ-59`). Measured on `alpine:3.20`, this daemon, 2026-08-15:
  13,660,215 bytes here against 4,103,199 in the panel, the difference being the 9,486,336-byte
  unpacked layer the image's own history reports.
- **One overflow control and nothing else** in the `ACTIONS` area of every row, in the same final
  position in every state of the image (tagged, multi-tagged or dangling), never conditional and
  never revealed on hover. It is named `More actions for <the row's title>` — the tags joined, or
  `<none> (<short id>)` for a dangling image, so two dangling rows are still told apart. The column
  is sized from the library's menu-only action column token, not from the wider button one, so the
  data columns beside it take that width back.
- Its menu holds exactly ten entries, always all ten, always in this order, read as three groups
  marked by separation and tone alone — no heading, no group label, no icon:
  - `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — the image's
    own four analyses, none of them carrying a hint;
  - a separator, then `Run…`, `Tag…`, `Untag`, `Push…`, `Save`;
  - a separator, then — in the destructive tone and carrying the hint `rmi` — `Remove`.
  `Remove` is the only entry carrying a hint: every other label is the CLI verb or the analysis's own
  words already. The ellipsis follows what each operation does rather than the label's shape: the
  four analyses, `Run…`, `Tag…` and `Push…` ask for something (a view to work in, a value) before
  anything happens, `Untag` (single-tag case), `Save` and `Remove` do not.
- On a dangling image the same ten entries appear in the same order, `Untag` and `Push…` disabled
  and stating why ("This image has no tags to untag." / "…to push.") rather than removed.
- `Explore layers…`, `Efficiency & signals…` and `Browse filesystem…` apply to every image and are
  never disabled. `Compare with…` is disabled — shown in place, never removed — when the unfiltered
  list holds fewer than two images, and its reason states the condition of **the list** ("There is no
  second image in the list to compare with."), deliberately unlike `Untag`/`Push…`, whose reasons are
  facts about *this* image: an entry greyed because an unrelated image was deleted must not read as a
  fault of this row. The condition follows the live list, so an image appearing or vanishing from
  outside the application makes the entry available or unavailable at the next opening.
- Selecting a row expands an `ImageDetailPanel` with its inspect data directly below it; the
  expanded region carries the panel alone, with no row control inside it.
- An empty/loading state inside the table area when there are no matching images.
Actions:
- "Pull image…" opens a `FormDialog` for a reference and an optional platform; submitting opens the
  pull progress stream and shows its steps via `StepProgressList`. Once the stream ends
  successfully, the dialog closes itself and re-reads the list, with no action required from the
  operator; if it ends in error, the dialog stays open showing the failure so the operator can read
  it, and closing it (Cancel) still re-reads the list.
- `Run…` opens the containers' `ContainerCreateForm` pre-filled with that image's
  reference (its short id when it is dangling), so the image can be run without leaving the screen
  (REQ-29); creating or cancelling closes the form and leaves the images list as it was.
- `Tag…` opens a `FormDialog` for a new reference; submitting tags the image, shows a
  success toast, and re-reads the list.
- `Untag` untags immediately when the image has a single tag; when it has several, it
  opens a `FormDialog` with a `Select` of its references and untags the chosen one on submit. Either
  way the list is re-read afterwards, and no confirmation is asked.
- `Push…` opens a `FormDialog` to pick which tag to push (a `Select` when the image
  has more than one tag); submitting opens the push progress stream and shows its steps until it
  ends. As with pull, a successful end closes the dialog and re-reads the list on its own; a failed
  end leaves the dialog open with the error shown.
- `Save`, and the `BulkActionBar`'s "Save to tarball…" action for every selected
  image, immediately trigger a browser download of the tarball named after the reference (or
  `"<count>-images.tar"` for several) via `triggerDownload`, and report a "Download started" toast
  naming the file (REQ-42): no dialog collects a target, since the browser owns the download and its
  own progress from here.
- The `BulkActionBar`'s "Compare filesystems…" action, enabled only when exactly two images are
  selected, opens the `ImageDiffView` with both pre-picked and clears the selection (REQ-63).

Actions (the image's four analysis views):
- `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…` and `Compare with…` open the
  `LayerExplorer`, the `LayerEfficiencyView`, the `FilesystemBrowser` and the `ImageDiffView` — views
  the **screen** presents, not the detail panel's. Each opens, shows its content and stays open with
  no detail panel open anywhere on the screen; whether a panel happens to be open has no bearing on
  whether one opens, on what it shows or on whether it stays open.
- Each acts on **the image whose row menu opened it** — never the selected one, never the one an open
  panel is showing — and stays on it however the list re-sorts, re-reads, gains or loses rows, the
  image being resolved from the live list by id.
- Opening one opens no detail panel and changes nothing about the selection; closing one closes no
  detail panel and changes nothing about the selection. A panel the operator had opened is exactly as
  they left it when the view closes.
- At most one of the four is on screen at a time: opening one closes whichever was already open.
- `Compare with…` opens the comparison with the row's image as the first side and the second side
  unchosen, chosen inside the view; the bulk `Compare filesystems…` opens the same one view with both
  sides pre-chosen. Neither shape leaves its operands behind for a later opening of the other.
- Closing one of the four leaves the point of interaction where the menu left it — on the row's
  overflow trigger, which is in the images list and outlives the view — since the `Menu` returns the
  focus to its trigger before the view opens and no dialog moves it afterwards.
- `Escape` with one of the four open dismisses nothing beneath it: the view holds the innermost claim
  on the key through the library's one arbitration registry and consumes it, so a panel open
  underneath stays open, the selection does not change and nothing on the list moves. Whether the key
  also closes the view is `Modal`'s own established behaviour (it does not) and is unchanged.
- None of the four outlives its image: when the image a view is showing is no longer in the
  **unfiltered** list — removed from that very menu, pruned, or removed or re-tagged outside the
  application — the view resolves itself rather than staying open on an image that no longer exists.
  Compared once the list has been read, exactly as the selection is: an image merely hidden by the
  search has not left the list, and a list not yet read says nothing about either.
- The efficiency and signals view's hand-off is the screen's now: choosing a finding closes that view
  and opens the layer explorer at the layer it concerns with the analysis already primed (past the
  cost warning), and the findings map it reports marks the layers carrying findings in the layer
  explorer — for that image alone, and only once the view has been analysed at least once.
- "Load tarball…" opens a `FormDialog` with a `FilePicker` for a local tarball (REQ-42); submitting
  closes that dialog and opens a `TransferProgressDialog` driven by `useFileUpload`, showing upload
  byte progress with a genuine cancel while it runs, the references loaded once it ends (Close
  re-reads the list), or the failure.
- **This dialog and the import one below state `Completed` like every other, and then wait**: they
  are the two the screen deliberately does **not** opt into the shared surface's self-dismissal
  (`autoCloseOnDone` is not passed), because the dialog's own body is the only place the references
  of the images just created are shown — a dialog that left on its own would take the operation's
  only result with it. They are dismissed by hand, and that is the correct behaviour rather than an
  omission: the four analyses opt in, these two do not.
- "Import filesystem…" opens a `FormDialog` with a `FilePicker` for a local filesystem tarball and an
  optional target reference (REQ-43); submitting opens the same kind of `TransferProgressDialog`
  (a second, independent `useFileUpload`) over the containers' filesystem-import upload, showing the
  resulting reference (or the daemon's own image id when none was given) once it ends, or the
  failure.
- `Remove` goes through `useConfirmation().confirm()` first; cancelling performs
  nothing. The menu is a step in front of that confirmation, never a substitute for it.
  "Prune dangling" also confirms first and reports the removed count and reclaimed space
  via `useToast()` on success. Any failure reports the daemon's own message via
  `useErrorReporter()`.
- The search field matches any tag, the digest or the id (case-insensitive substring) (REQ-41).

Actions (selection and dismissal):
- Selecting a row opens its `ImageDetailPanel`; selecting that same row again closes it — the row is
  the panel's only pointer route, the panel offering no close control of its own — and selecting a
  different row leaves the panel open and re-points it at that image. `Escape` closes it too
  (`image-detail-panel.md`), and the owning row is visibly the selected one while it is open.
- A selected image that leaves the list — removed from its own row's menu, pruned, or removed
  anywhere else on the machine — takes its row, its panel **and its selection** with it. One merely
  hidden by the search keeps its selection: its row and its panel are simply not rendered, and both
  come back unchanged when the search is cleared.

Navigation:
- Arriving here from a build-cache record's reference (REQ-69) selects the named image — its panel
  opening as it always did — and opens the layer explorer on that image at the layer it names, on
  arrival and again on every later request, then acknowledges the navigation request. Changesets stay
  behind their cost warning, nothing here saying they are already cached. The layer focus applies
  only to the image it names: selecting another row afterwards never inherits it.

## Rules and invariants

- "Prune dangling" is disabled when no image is currently dangling (untagged).
- `Push…` and `Untag` are disabled for a dangling image (no reference to act on), and every disabled
  entry carries the reason it is unavailable, so a greyed entry is legible as "not for this image,
  because…" — or, for `Compare with…` alone, as "not while the list holds only this one" — rather
  than as broken.
- Every row's menu offers the same ten entries in the same order at every opening, on every image,
  whatever its tags and whatever else the list holds: the order never differs between two openings.
- A menu's entries are bound to the image its row was rendered for, so the list re-reading or
  re-sorting under an open menu can never point an entry at another image; the menu belongs to the
  row's identity (the image id) and goes with it if that image leaves the list.
- The list keeps re-reading on its poll and on `image` daemon events at its usual rate while a menu
  is open: nothing is paused, throttled or debounced for the menu's benefit.
- The row's action area is the row's only action-bearing area: no other action-bearing control or
  glyph appears anywhere on the row, and opening the menu never also selects the row.
- This screen contributes no markup and no styling of its own for the action area: it is one
  `ActionButtonGroup` with an empty action list and its trailing `Menu`, and the sizing is a library
  token — four more entries make the popup taller, never the trigger wider, and no length is written
  here. One menu open at a time, non-clipping over ten entries, keyboard-operable, focus returned to
  the trigger and the innermost `Escape` claimant on this screen are the library's, by consuming it
  unchanged. The screen adds no overlay surface, no blur and no filter of its own.
- The screen holds **one** comparison view, serving both shapes of the operation: the row shape (one
  operand) and the bulk shape (two). Which of the four views is open, and the image it was opened on,
  is one piece of state, so two of them can never be on screen together and none can be pointed at an
  image other than the one whose menu opened it.
- Only one image row can be expanded at a time, and it is the selected one.
- The selection never outlives its image. Compared against the unfiltered list, and only once the
  list has actually been read: an image id is a digest of its content, so the same content pulled or
  built again reproduces the id, and a selection surviving a removal would make the panel spring
  open unasked.
- Multi-selection (the checkbox column and `BulkActionBar`) is independent of the single-row
  expansion selection driving `ImageDetailPanel`.
- REQ-3's "same visual language" between this table and the Containers table (batch 31's
  remediation) is about the treatment the `DataTable` primitive applies uniformly — row height,
  header style, column typography, hover and selected treatment — never about the two screens
  sharing an identical column set. Images alone carries the leading multi-select checkbox column
  (and `BulkActionBar`) because it alone has a bulk action that needs a selection (`Save to
  tarball…`); Containers has no equivalent per-row bulk action (see `containers-screen.md`), so it
  carries none. That difference is intentional and does not violate REQ-3.

## Dependencies

- ui-library: ScreenToolbar, SearchField, DataTable, BulkActionBar, StatusDotCell, TwoLineCell,
  MetaCell, IdentifierCell, BadgeListCell, ActionButtonGroup, Menu, FormDialog, StepProgressList,
  TransferProgressDialog, FilePicker, triggerDownload, TextField, Select, Card, ErrorBanner,
  EmptyState, Stack, useToast
- Images client, useImageTransferStream, useFileUpload
- ImageDetailPanel, LayerExplorer, LayerEfficiencyView, FilesystemBrowser, ImageDiffView
- containers: ContainerCreateForm, Container transfer client
- app-shell: ConfirmationService, ProgressService, ErrorReportingService, CrossNavigationService

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-41
- plan-docker_management_app/REQ-29
- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-66
- plan-docker_management_app/REQ-67
- plan-docker_management_app/REQ-69
- plan-docker_management_app-image_row_actions/REQ-1
- plan-docker_management_app-image_row_actions/REQ-2
- plan-docker_management_app-image_row_actions/REQ-3
- plan-docker_management_app-image_row_actions/REQ-4
- plan-docker_management_app-image_row_actions/REQ-5
- plan-docker_management_app-image_row_actions/REQ-6
- plan-docker_management_app-image_row_actions/REQ-7
- plan-docker_management_app-image_row_actions/REQ-8
- plan-docker_management_app-image_row_actions/REQ-9
- plan-docker_management_app-image_row_actions/REQ-10
- plan-docker_management_app-image_row_actions/REQ-11
- plan-docker_management_app-image_row_actions/REQ-12
- plan-docker_management_app-image_row_actions/REQ-13
- plan-docker_management_app-image_row_actions/REQ-14
- plan-docker_management_app-image_row_actions/REQ-15
- plan-docker_management_app-image_row_actions/REQ-16
- plan-docker_management_app-image_row_actions/REQ-17
- plan-docker_management_app-image_row_actions/REQ-18
- plan-docker_management_app-image_row_actions/REQ-19
- plan-docker_management_app-image_row_actions/REQ-22
- plan-docker_management_app-image_row_actions/REQ-23
- plan-docker_management_app-image_row_actions/REQ-25
- plan-docker_management_app-image_row_actions/REQ-28
- plan-docker_management_app-image_row_actions/REQ-29
- plan-docker_management_app-image_row_actions/REQ-30
- plan-docker_management_app-image_row_actions/REQ-33
- plan-docker_management_app-image_row_actions/REQ-37
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-4
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-5
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-6
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-7
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-8
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-9
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-10
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-11
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-12
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-13
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-14
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-15
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-16
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-17
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-18
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-19
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-20
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-21
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-22
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-24
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-25
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-26
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-31
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-32
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-33
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-34
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-35
- plan-docker_management_app-progress_completion_autoclose/REQ-5
- plan-docker_management_app-progress_completion_autoclose/REQ-12
- plan-docker_management_app-progress_completion_autoclose/REQ-15
- plan-docker_management_app-progress_completion_autoclose/REQ-16
- plan-ui-coherence-optimisation/REQ-57
- plan-ui-coherence-optimisation/REQ-58
- plan-ui-coherence-optimisation/REQ-59
