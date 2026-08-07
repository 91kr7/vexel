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
- A `ScreenToolbar` with a "Pull image…" primary action, disabled "Build from Dockerfile…" and
  "Load tarball" secondary actions (wired by later batches — image build and image transport), a
  "Prune dangling" destructive action, and a search filter — above a `DataTable` of every image
  matching the current search, laid out exactly like the containers table (same header row, row
  height, typography, hover and selected treatment).
Shows:
- A header row and one row per matching image, in these columns: a leading status dot (green when
  the image has at least one tag, amber when it is dangling), `REPOSITORY:TAG` — the first reference
  (or `<none>`) over the short id, `TAGS` — one badge per tag (at most 2, then a `+N` badge) or a
  single `dangling` warning badge when it has none, `DIGEST` — the digest (falling back to the id)
  cut to a short identifier, `PLATFORM`, `SIZE` (right-aligned), `CREATED` — the age, and `ACTIONS`.
- The four per-image actions (tag, untag, push, remove) on every row, always visible, without
  expanding it; untag and push are disabled for a dangling image.
- Selecting a row expands an `ImageDetailPanel` with its inspect data directly below it; the
  expanded region carries the panel alone.
- An empty/loading state inside the table area when there are no matching images.
Actions:
- "Pull image…" opens a `FormDialog` for a reference and an optional platform; submitting opens the
  pull progress stream and shows its steps via `StepProgressList`. Once the stream ends
  successfully, the dialog closes itself and re-reads the list, with no action required from the
  operator; if it ends in error, the dialog stays open showing the failure so the operator can read
  it, and closing it (Cancel) still re-reads the list.
- A row's "tag" action opens a `FormDialog` for a new reference; submitting tags the image, shows a
  success toast, and re-reads the list.
- A row's "untag" action untags immediately when the image has a single tag; when it has several, it
  opens a `FormDialog` with a `Select` of its references and untags the chosen one on submit. Either
  way the list is re-read afterwards, and no confirmation is asked.
- A row's "push" action opens a `FormDialog` to pick which tag to push (a `Select` when the image
  has more than one tag); submitting opens the push progress stream and shows its steps until it
  ends. As with pull, a successful end closes the dialog and re-reads the list on its own; a failed
  end leaves the dialog open with the error shown.
- A row's "remove" action goes through `useConfirmation().confirm()` first; cancelling performs
  nothing. "Prune dangling" also confirms first and reports the removed count and reclaimed space
  via `useToast()` on success. Any failure reports the daemon's own message via
  `useErrorReporter()`.
- The search field matches any tag, the digest or the id (case-insensitive substring) (REQ-41).

## Rules and invariants

- "Prune dangling" is disabled when no image is currently dangling (untagged).
- "Push" and "untag" are disabled for a dangling image (no reference to act on).
- Every row carries the same four actions in the same order, so the action column's width is
  constant and the row never overflows.
- Only one image row can be expanded at a time, and it is the selected one.

## Dependencies

- ui-library: ScreenToolbar, SearchField, DataTable, StatusDotCell, TwoLineCell, MetaCell,
  IdentifierCell, BadgeListCell, ActionButtonGroup, FormDialog, StepProgressList, TextField, Select,
  Card, ErrorBanner, EmptyState, Stack, useToast
- Images client, useImageTransferStream
- ImageDetailPanel
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-41
