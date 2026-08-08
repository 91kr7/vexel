---
module: images
component: ImageDiffView
type: UI component
---

# ImageDiffView

**Purpose** → cross-image filesystem diff view: pick two images (or start from ones already
chosen), a cost warning then cancellable comparison progress, then the difference as a navigable,
status-filterable tree; selecting a changed path states what changed and previews both sides
side by side (REQ-63, REQ-64).

## Contract

- `<ImageDiffView images initialImageAId? initialImageBId? open onClose />` — `images:
  ImageSummary[]`, offered as the pick-list for both sides; `initialImageAId?`/`initialImageBId?`
  pre-select one or both sides (a two-image bulk selection gives both, an image's "Compare with…"
  action gives only its own id); `open` shows the view, resetting its picks to the initial ids each
  time it opens.

Description:
- A large `Modal` holding two `Select`s (with a "vs" `Badge` between them) to choose or change the
  two images, then — once a comparison has run — a `StatusPill` summarising the counts and a
  `SplitPane` pairing a `DiffTreeView` of the difference with the selected path's detail.
Shows:
- Before any comparison: an `EmptyState` inviting the operator to pick two images and compare.
- After a comparison: the `StatusPill` ("`<n>` added · `<n>` removed · `<n>` changed"), the
  `DiffTreeView` (status-filterable, lazily expanded one directory level at a time), and — once a
  path is selected — a row of `Badge`s naming its changed aspects (REQ-64: content, size, mode,
  ownership, symlink target), a `DefinitionList` of each side's size/permissions/owner/link-target,
  and, for a changed file, a `SideBySideViewer` previewing both sides' content.
Actions:
- "Compare" → opens a `ConfirmDialog` naming both images and stating the estimated time (either
  side not already extracted is extracted as part of the comparison); confirming starts the
  comparison stream.
- The comparison progress dialog offers Cancel while active and Close once it ends, same
  cancel-vs-close distinction as the filesystem browser's extraction dialog: Cancel discards the
  run and returns to the picker; Close, once succeeded, only dismisses the dialog and the diff tree
  stays; Close, once failed, clears the run so comparison can be retried.
- Choosing a status filter chip narrows the tree to that status (and any ancestor directory holding
  a match in its subtree, via `DiffTreeView`'s roll-up).
- Selecting a tree row shows that path's changed aspects and side-by-side content in the detail
  pane; a path present on only one side shows an empty message on the other instead of a viewer.
- Expanding a directory the first time triggers its lazy child read; re-expanding it does not
  re-fetch.

## Rules and invariants

- A path's detail (natures, per-side metadata) comes straight from the already-loaded diff entry,
  not a further fetch; only a changed file's content preview issues a fetch per side, and only for
  the side the path exists on.
- Closing the view only hides it: a completed comparison's tree stays browsable on the next open of
  the same pair, same as the filesystem browser and the layer explorer — only Cancel, or starting a
  new comparison, replaces it.
- Reopening the view (a fresh `open`) always resets the picked images to `initialImageAId`/
  `initialImageBId`, the tree state and the status filter, so a stale comparison from a previous
  pair is never shown against a new pick.

## Dependencies

- ui-library: Modal, Select, Badge, Row, Stack, SplitPane, DiffTreeView, DefinitionList,
  SideBySideViewer, EmptyState, Spinner, StatusPill, ConfirmDialog, TransferProgressDialog, Button
- useImageDiffStream, useImageDiffTree, Image diff client
- useImageFilesystemEntryContent (paired content reads, one call per side)

## Requirements served

- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-64
