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
- The six per-image actions (run, tag, untag, push, save, remove) on every row, always visible,
  without expanding it; untag and push are disabled for a dangling image.
- Selecting a row expands an `ImageDetailPanel` with its inspect data directly below it; the
  expanded region carries the panel alone.
- An empty/loading state inside the table area when there are no matching images.
Actions:
- "Pull image…" opens a `FormDialog` for a reference and an optional platform; submitting opens the
  pull progress stream and shows its steps via `StepProgressList`. Once the stream ends
  successfully, the dialog closes itself and re-reads the list, with no action required from the
  operator; if it ends in error, the dialog stays open showing the failure so the operator can read
  it, and closing it (Cancel) still re-reads the list.
- A row's "run" action opens the containers' `ContainerCreateForm` pre-filled with that image's
  reference (its short id when it is dangling), so the image can be run without leaving the screen
  (REQ-29); creating or cancelling closes the form and leaves the images list as it was.
- A row's "tag" action opens a `FormDialog` for a new reference; submitting tags the image, shows a
  success toast, and re-reads the list.
- A row's "untag" action untags immediately when the image has a single tag; when it has several, it
  opens a `FormDialog` with a `Select` of its references and untags the chosen one on submit. Either
  way the list is re-read afterwards, and no confirmation is asked.
- A row's "push" action opens a `FormDialog` to pick which tag to push (a `Select` when the image
  has more than one tag); submitting opens the push progress stream and shows its steps until it
  ends. As with pull, a successful end closes the dialog and re-reads the list on its own; a failed
  end leaves the dialog open with the error shown.
- A row's "save" action, and the `BulkActionBar`'s "Save to tarball…" action for every selected
  image, immediately trigger a browser download of the tarball named after the reference (or
  `"<count>-images.tar"` for several) via `triggerDownload`, and report a "Download started" toast
  naming the file (REQ-42): no dialog collects a target, since the browser owns the download and its
  own progress from here.
- "Load tarball…" opens a `FormDialog` with a `FilePicker` for a local tarball (REQ-42); submitting
  closes that dialog and opens a `TransferProgressDialog` driven by `useFileUpload`, showing upload
  byte progress with a genuine cancel while it runs, the references loaded once it ends (Close
  re-reads the list), or the failure.
- "Import filesystem…" opens a `FormDialog` with a `FilePicker` for a local filesystem tarball and an
  optional target reference (REQ-43); submitting opens the same kind of `TransferProgressDialog`
  (a second, independent `useFileUpload`) over the containers' filesystem-import upload, showing the
  resulting reference (or the daemon's own image id when none was given) once it ends, or the
  failure.
- A row's "remove" action goes through `useConfirmation().confirm()` first; cancelling performs
  nothing. "Prune dangling" also confirms first and reports the removed count and reclaimed space
  via `useToast()` on success. Any failure reports the daemon's own message via
  `useErrorReporter()`.
- The search field matches any tag, the digest or the id (case-insensitive substring) (REQ-41).

## Rules and invariants

- "Prune dangling" is disabled when no image is currently dangling (untagged).
- "Push" and "untag" are disabled for a dangling image (no reference to act on).
- Every row carries the same six actions in the same order, so the action column's width is
  constant and the row never overflows.
- Only one image row can be expanded at a time, and it is the selected one.
- Multi-selection (the checkbox column and `BulkActionBar`) is independent of the single-row
  expansion selection driving `ImageDetailPanel`.

## Dependencies

- ui-library: ScreenToolbar, SearchField, DataTable, BulkActionBar, StatusDotCell, TwoLineCell,
  MetaCell, IdentifierCell, BadgeListCell, ActionButtonGroup, FormDialog, StepProgressList,
  TransferProgressDialog, FilePicker, triggerDownload, TextField, Select, Card, ErrorBanner,
  EmptyState, Stack, useToast
- Images client, useImageTransferStream, useFileUpload
- ImageDetailPanel
- containers: ContainerCreateForm, Container transfer client
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-41
- plan-docker_management_app/REQ-29
- plan-docker_management_app/REQ-42
- plan-docker_management_app/REQ-43
