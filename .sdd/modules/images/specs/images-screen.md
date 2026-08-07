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
  "Prune dangling" destructive action, and a search filter — above a `CardList` of every image
  matching the current search.
Shows:
- One card per matching image: its tags joined (or `<none> (shortId)` for a dangling image) as the
  title, `digest · platform(s)` as the monospace subtitle, a `dangling` warning badge when it has no
  tags, and its age and size as trailing meta.
- Selecting a card's header expands it in place to show its per-image action group (tag; untag —
  one action per tag when it has more than one; push, disabled when it has none; remove) and an
  `ImageDetailPanel` with its inspect data.
- An empty/loading state inside the list area when there are no matching images.
Actions:
- "Pull image…" opens a `FormDialog` for a reference and an optional platform; submitting opens the
  pull progress stream and shows its steps via `StepProgressList`. Once the stream ends
  successfully, the dialog closes itself and re-reads the list, with no action required from the
  operator; if it ends in error, the dialog stays open showing the failure so the operator can read
  it, and closing it (Cancel) still re-reads the list.
- A card's "tag" action opens a `FormDialog` for a new reference; submitting tags the image, shows a
  success toast, and re-reads the list.
- A card's "untag" action (per tag when the image has several) untags that reference immediately
  and re-reads the list.
- A card's "push" action opens a `FormDialog` to pick which tag to push (a `Select` when the image
  has more than one tag); submitting opens the push progress stream and shows its steps until it
  ends. As with pull, a successful end closes the dialog and re-reads the list on its own; a failed
  end leaves the dialog open with the error shown.
- A card's "remove" action goes through `useConfirmation().confirm()` first; cancelling performs
  nothing. "Prune dangling" also confirms first and reports the removed count and reclaimed space
  via `useToast()` on success. Any failure reports the daemon's own message via
  `useErrorReporter()`.
- The search field matches any tag, the digest or the id (case-insensitive substring) (REQ-41).

## Rules and invariants

- "Prune dangling" is disabled when no image is currently dangling (untagged).
- "Push" is disabled for a dangling image (nothing to push).
- Only one image card can be expanded at a time.

## Dependencies

- ui-library: ScreenToolbar, SearchField, CardList, ActionButtonGroup, Badge, FormDialog,
  StepProgressList, TextField, Select, Card, ErrorBanner, EmptyState, Stack, useToast
- Images client, useImageTransferStream
- ImageDetailPanel
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
- plan-docker_management_app/REQ-41
