---
module: images
component: FilesystemBrowser
type: UI component
---

# FilesystemBrowser

**Purpose** → the filesystem browser for one image: a cost warning, then cancellable extraction
progress, then the merged filesystem as a lazily expanded, searchable tree with an entry's
metadata/content-preview panel and single-file/subtree download, with the source of the displayed
data (freshly extracted / from cache) and a re-extract action (REQ-52, REQ-55, REQ-58–62, REQ-113).

## Contract

- `<FilesystemBrowser image open onClose />` — `image: ImageSummary`; `open` shows the browser.

Description:
- A large `Modal` holding, before extraction, an `EmptyState` explaining that no process from the
  image is ever run and inviting the operator to browse; after extraction, a search field over the
  tree, then a `SplitPane` — a searchable `TreeView` of the merged filesystem on the left, the
  selected entry's metadata and (for a file) content preview in the right pane.
Shows:
- A `StatusPill` naming the data's source ("From cache" / "Freshly extracted") and its entry count,
  once extraction has completed, with an inline "Re-extract…" action (REQ-113), and a "Download whole
  filesystem…" action next to it (REQ-61).
- A `FieldMessage` under it, once extraction has completed, stating that the tree includes Docker's
  own container-creation scaffolding, not necessarily shipped by the image itself (REQ-52); a second
  `FieldMessage` when the extraction refused any entry, stating how many and why (an absolute path, a
  `../` segment, or a symlink target escaping the tree) (REQ-62).
- Before extraction: the explanatory `EmptyState` with a "Browse filesystem…" action.
- After extraction: a `StreamSearchField` searching the tree by name/path fragment (REQ-60), with a
  muted notice when the match list was truncated; the tree, lazily expanded — a directory's children
  are fetched only the first time it is expanded — with matching entries marked in place
  (`TreeView`'s `matchedIds`).
- The right pane, once an entry is selected: a `DefinitionList` with path, type, size, permissions,
  owner (uid:gid) and modification time, plus a link-target row for a symlink (REQ-58); for a
  directory, a "Download this folder…" action (REQ-61); for a file, a `SegmentedControl` switching
  the preview between text and hex (REQ-59), a "Download" action (REQ-61), and the preview itself as
  a `TextViewer` or `HexDumpViewer` with its truncation notice when the file is oversized.
Actions:
- "Browse filesystem…" / "Re-extract…" → opens a `ConfirmDialog` naming the image and stating the
  estimated time and temporary disk cost, then starts the extraction stream on confirmation
  (REQ-55).
- The extraction progress dialog offers Cancel while active and Close once it ends, same
  cancel-vs-close distinction as the layer explorer's analysis dialog: Cancel discards the run (the
  intermediate container is still removed server-side) and returns to the "not extracted yet"
  prompt; Close, once succeeded, only dismisses the dialog and the browsed tree stays; Close, once
  failed, also clears the run so extraction can be retried.
- Typing in the search field, "Next"/"Previous" → navigates `activeMatchIndex`; each navigation
  selects that match, expands (and lazily loads) every one of its ancestor directories so it becomes
  visible in the tree (REQ-60).
- Selecting a tree row shows that entry's metadata (and, for a file, content preview) in the
  right-hand pane; a fresh selection always previews the auto-detected mode again, discarding any
  earlier text/hex override.
- Expanding a directory the first time triggers its lazy child read; re-expanding it does not
  re-fetch.
- "Download" (a file) / "Download this folder…" / "Download whole filesystem…" → for a single file,
  triggers the browser download directly; for a subtree, first fetches its export summary and shows
  the outcome (file count, total size, and how many entries were skipped, if any) as a toast, then
  triggers the archive download (REQ-61). A failure to prepare the summary is reported as a toast
  instead of starting a download.

## Rules and invariants

- A re-extraction (`force=true`) resets every loaded tree level, the expansion state, the selection
  and the search query before the new stream starts, so nothing from the previous run is shown
  against the fresh one.
- Closing the whole browser (the Modal's own close control) only hides it: a completed extraction's
  tree stays browsable on the next open of the same image, same as the layer explorer's changeset
  result — only Cancel, or starting a new extraction, replaces it.
- No process from the image is ever executed by this component or by what it drives server-side
  (REQ-53).
- The metadata and content panels are driven by direct server reads keyed on the selected path, not
  by the client-side lazily loaded tree levels, so the detail panel is correct even for a search
  match whose ancestor directories have not finished loading yet.

## Dependencies

- ui-library: Modal, SplitPane, TreeView, DefinitionList, EmptyState, ConfirmDialog,
  TransferProgressDialog, StatusPill, FieldMessage, ErrorBanner, Button, Row, Stack, Spinner,
  StreamSearchField, SegmentedControl, TextViewer, HexDumpViewer, triggerDownload, useToast
- useImageFilesystemExtraction, useImageFilesystemTree, useImageFilesystemEntryMetadata,
  useImageFilesystemEntryContent, useImageFilesystemSearch, Image filesystem client

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-53
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-55
- plan-docker_management_app/REQ-56
- plan-docker_management_app/REQ-58
- plan-docker_management_app/REQ-59
- plan-docker_management_app/REQ-60
- plan-docker_management_app/REQ-61
- plan-docker_management_app/REQ-62
- plan-docker_management_app/REQ-113
