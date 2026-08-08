---
module: images
component: FilesystemBrowser
type: UI component
---

# FilesystemBrowser

**Purpose** → the filesystem browser for one image: a cost warning, then cancellable extraction
progress, then the merged filesystem as a lazily expanded tree, with the source of the displayed
data (freshly extracted / from cache) and a re-extract action (REQ-52, REQ-55, REQ-113).

## Contract

- `<FilesystemBrowser image open onClose />` — `image: ImageSummary`; `open` shows the browser.

Description:
- A large `Modal` holding, before extraction, an `EmptyState` explaining that no process from the
  image is ever run and inviting the operator to browse; after extraction, a `SplitPane` — a
  `TreeView` of the merged filesystem on the left, the selected entry's details (path, type, size)
  in a `DefinitionList` on the right.
Shows:
- A `StatusPill` naming the data's source ("From cache" / "Freshly extracted") and its entry count,
  once extraction has completed, with an inline "Re-extract…" action (REQ-113).
- A `FieldMessage` under it, once extraction has completed, stating that the tree includes Docker's
  own container-creation scaffolding (e.g. `.dockerenv`, `dev/`, `etc/hostname`, `proc/`, `sys/`),
  not necessarily shipped by the image itself — so it is never silently misread as image content
  (REQ-52).
- Before extraction: the explanatory `EmptyState` with a "Browse filesystem…" action.
- After extraction: the tree, lazily expanded — a directory's children are fetched only the first
  time it is expanded.
Actions:
- "Browse filesystem…" / "Re-extract…" → opens a `ConfirmDialog` naming the image and stating the
  estimated time and temporary disk cost, then starts the extraction stream on confirmation
  (REQ-55).
- The extraction progress dialog offers Cancel while active and Close once it ends, same
  cancel-vs-close distinction as the layer explorer's analysis dialog: Cancel discards the run (the
  intermediate container is still removed server-side) and returns to the "not extracted yet"
  prompt; Close, once succeeded, only dismisses the dialog and the browsed tree stays; Close, once
  failed, also clears the run so extraction can be retried.
- Selecting a tree row shows that entry's details in the right-hand pane.
- Expanding a directory the first time triggers its lazy child read; re-expanding it does not
  re-fetch.

## Rules and invariants

- A re-extraction (`force=true`) resets every loaded tree level, the expansion state and the
  selection before the new stream starts, so nothing from the previous run is shown against the
  fresh one.
- Closing the whole browser (the Modal's own close control) only hides it: a completed extraction's
  tree stays browsable on the next open of the same image, same as the layer explorer's changeset
  result — only Cancel, or starting a new extraction, replaces it.
- No process from the image is ever executed by this component or by what it drives server-side
  (REQ-53).

## Dependencies

- ui-library: Modal, SplitPane, TreeView, DefinitionList, EmptyState, ConfirmDialog,
  TransferProgressDialog, StatusPill, FieldMessage, Button, Row, Stack
- useImageFilesystemExtraction, useImageFilesystemTree, Image filesystem client

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-53
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-55
- plan-docker_management_app/REQ-56
- plan-docker_management_app/REQ-113
