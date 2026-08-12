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
  the image has at least one tag, amber when it is dangling), `REPOSITORY:TAG` — the first reference
  (or `<none>`) over the short id, `TAGS` — one badge per tag (at most 2, then a `+N` badge) or a
  single `dangling` warning badge when it has none, `DIGEST` — the digest (falling back to the id)
  cut to a short identifier, `PLATFORM`, `SIZE` (right-aligned), `CREATED` — the age, and `ACTIONS`.
- **One overflow control and nothing else** in the `ACTIONS` area of every row, in the same final
  position in every state of the image (tagged, multi-tagged or dangling), never conditional and
  never revealed on hover. It is named `More actions for <the row's title>` — the tags joined, or
  `<none> (<short id>)` for a dangling image, so two dangling rows are still told apart. The column
  is sized from the library's menu-only action column token, not from the wider button one, so the
  data columns beside it take that width back.
- Its menu holds exactly six entries, always all six, always in this order: `Run…`, `Tag…`, `Untag`,
  `Push…`, `Save`, then — set apart as a group, in the destructive tone and carrying the hint
  `rmi` — `Remove`. No other entry carries a hint: the remaining labels are the CLI verbs already.
  The ellipsis follows what each operation does rather than the label's shape: `Run…`, `Tag…` and
  `Push…` ask for something before they act, `Untag` (single-tag case), `Save` and `Remove` do not.
- On a dangling image the same six entries appear in the same order, `Untag` and `Push…` disabled
  and stating why ("This image has no tags to untag." / "…to push.") rather than removed.
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
- "Load tarball…" opens a `FormDialog` with a `FilePicker` for a local tarball (REQ-42); submitting
  closes that dialog and opens a `TransferProgressDialog` driven by `useFileUpload`, showing upload
  byte progress with a genuine cancel while it runs, the references loaded once it ends (Close
  re-reads the list), or the failure.
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
- Arriving here from a build-cache record's reference (REQ-69) selects the named image and hands its
  detail panel the layer to open at, then acknowledges the navigation request. The layer focus
  applies only to the image it names: selecting another row afterwards never inherits it.

## Rules and invariants

- "Prune dangling" is disabled when no image is currently dangling (untagged).
- `Push…` and `Untag` are disabled for a dangling image (no reference to act on), and every disabled
  entry carries the reason it is unavailable, so a greyed entry is legible as "not for this image,
  because…" rather than as broken.
- Every row's menu offers the same six entries in the same order at every opening, on every image,
  whatever its tags: the order never differs between two openings.
- A menu's entries are bound to the image its row was rendered for, so the list re-reading or
  re-sorting under an open menu can never point an entry at another image; the menu belongs to the
  row's identity (the image id) and goes with it if that image leaves the list.
- The list keeps re-reading on its poll and on `image` daemon events at its usual rate while a menu
  is open: nothing is paused, throttled or debounced for the menu's benefit.
- The row's action area is the row's only action-bearing area: no other action-bearing control or
  glyph appears anywhere on the row, and opening the menu never also selects the row.
- This screen contributes no markup and no styling of its own for the action area: it is one
  `ActionButtonGroup` with an empty action list and its trailing `Menu`, and the sizing is a library
  token. One menu open at a time, non-clipping, keyboard-operable, focus returned to the trigger and
  the innermost `Escape` claimant on this screen are the library's, by consuming it unchanged.
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
- ImageDetailPanel, ImageDiffView
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
- plan-docker_management_app/REQ-63
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
