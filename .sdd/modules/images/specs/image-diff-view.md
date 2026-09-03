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
  pre-select one or both sides; `open` shows the view, resetting its picks to the initial ids each
  time it opens.
- **One view, two shapes of the operation, and this is a constraint on the view rather than a note
  about its callers.** The *bulk* shape supplies **both** operands (two checked rows) and opens with
  both pre-chosen; the *row* shape supplies **only** the first one (the row whose menu started it)
  and opens with the second unchosen, to be picked inside the view. Both work, in either order and
  repeatedly, and neither leaves its operands behind for a later opening of the other.

Description:
- A large `Modal` holding two `Select`s (with a "vs" `Badge` between them) to choose or change the
  two images, then — once a comparison has run — a `StatusPill` summarising the counts and a
  `SplitPane` pairing a `DiffTreeView` of the difference with the selected path's detail.
Shows:
- In the row shape (a first side supplied, no second), a line **stating in words which image the
  comparison was started from**, by the same reference the pick-list shows it under, so the operator
  reads which side is theirs instead of inferring it from a pre-filled `Select`. The operand is
  stated, **not pinned**: it stays changeable, and the line is shown only while the first side is
  still the one the comparison was started from. The bulk shape, which pre-chooses both sides, shows
  no such line. The `Modal`'s own title is "Compare filesystems" in both shapes.
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
- A failed comparison is reported as a toast carrying the daemon's own message, once per failure;
  the dialog states none and keeps the progress where the comparison stopped, and it offers no
  retry of its own (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-7).
- Once the comparison succeeds the dialog states `Completed` — the shared surface's own wording —
  and **dismisses itself** a second later, revealing the diff tree: this view asks the surface for
  that (`autoCloseOnDone`), its result being rendered behind the dialog rather than in it. No
  completion wording, state or timer of this view's own; its `formatCaption` keeps describing the
  in-flight phase only. A failed comparison never dismisses itself.
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
  pair is never shown against a new pick — and so an operand supplied by one shape of the operation
  can never survive into an opening of the other.
- A comparison of an image with itself cannot be started: "Compare" stays unavailable while either
  side is unchosen or both name the same image.

## Dependencies

- ui-library: Modal, Select, Badge, Row, Stack, SplitPane, DiffTreeView, DefinitionList,
  SideBySideViewer, EmptyState, FieldMessage, Spinner, StatusPill, ConfirmDialog,
  TransferProgressDialog, Button
- useImageDiffStream, useImageDiffTree, Image diff client
- useImageFilesystemEntryContent (paired content reads, one call per side)
- app-shell: useFailureReport

## Requirements served

- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-64
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-23
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-24
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-27
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-35
- plan-docker_management_app-progress_completion_autoclose/REQ-5
- plan-docker_management_app-progress_completion_autoclose/REQ-12
- plan-docker_management_app-progress_completion_autoclose/REQ-15
- plan-docker_management_app-progress_completion_autoclose/REQ-16
- plan-docker_management_app-inline_error_panels/REQ-5
- plan-docker_management_app-inline_error_panels/REQ-7
