---
module: images
component: FilesystemBrowser
type: UI component
---

# FilesystemBrowser

**Purpose** → the filesystem browser for one image, in **two shapes decided before anything is
raised**: with nothing kept for the image's content, the cost warning is the first thing on screen
and confirming it runs a cancellable extraction; with a result still kept, the merged filesystem is
on screen directly, with no warning about a cost that will not be paid and no progress dialog for an
operation that never runs. Either way the tree is lazily expanded and searchable, with an entry's
metadata/content-preview panel, single-file/subtree download, the source of the displayed data
(freshly extracted / from cache) with its entry count, and a re-extract action (REQ-52, REQ-55,
REQ-58–62, REQ-113).

## Contract

- `<FilesystemBrowser image open onClose />` — `image: ImageSummary`; `open` shows the browser.

Description:
- A large `Modal` whose body is, once the shape is known, either **nothing at all** (shape A: the
  cost warning is on screen over it, and the surface behind it carries only its title) or the
  browsed filesystem (shape B and every completed extraction), laid out as a `BandStack`: the status
  row, the scaffolding note, the refused-entries note when present, the search band and the
  truncated-matches note when present are **bands** — each the height of its own content — over the
  **single elastic region**, which holds the `SplitPane` of the searchable `TreeView` and the
  selected entry's metadata and (for a file) content preview.
- **The height of this surface is distributed by intent and stated nowhere in it.** The region's
  bound comes from the dialog, through the arrangement: `SplitPane` and `TreeView` are both in their
  fill modes, so the tree keeps a definite bounded height to virtualise within, and the dialog stays
  the size of its content when its content is short. The idle detail placeholder is `EmptyState`'s
  compact variant, at the top of the trailing pane.
Shows:
- **While the shape is being decided**: a `Spinner` alone, labelled with the image's own reference —
  no heading, no button, nothing to press. The operator is asked for nothing in order to find out
  which shape applies.
- A `StatusPill` naming the data's source ("From cache" / "Freshly extracted") and its entry count,
  once a result is on screen — a kept one as much as a just-extracted one — with an inline
  "Re-extract…" action (REQ-113), and a "Download whole filesystem…" action next to it (REQ-61).
- A `FieldMessage` under it, stating that the tree includes Docker's own container-creation
  scaffolding, not necessarily shipped by the image itself (REQ-52); a second `FieldMessage` when
  the result reports refused entries, stating how many and why (an absolute path, a `../` segment,
  or a symlink target escaping the tree) (REQ-62).
- The `StreamSearchField` searching the tree by name/path fragment (REQ-60), with a muted notice when
  the match list was truncated; the tree, lazily expanded — a directory's children are fetched only
  the first time it is expanded — with matching entries marked in place (`TreeView`'s `matchedIds`).
- The right pane, once an entry is selected: a `DefinitionList` with path, type, size, permissions,
  owner (uid:gid) and modification time, plus a link-target row for a symlink (REQ-58); for a
  directory, a "Download this folder…" action (REQ-61); for a file, a `SegmentedControl` switching
  the preview between text and hex (REQ-59), a "Download" action (REQ-61), and the preview itself as
  a `TextViewer` or `HexDumpViewer` with its truncation notice when the file is oversized.
- **No "not extracted yet" screen exists at any point of this flow**, in any shape: no surface
  presents a control repeating the request the operator has just made.
Actions:
- Opening (`open` becoming true) → reads whether a result is kept for this image's content
  (`useImageFilesystemKeptResult`) and, on that answer alone, either raises the `ConfirmDialog`
  immediately (nothing kept) or shows the kept tree (kept). Nothing is started to find out.
- "Re-extract…" → opens the same `ConfirmDialog`, naming the image and stating the estimated time
  and temporary disk cost, then starts the extraction stream with `force=true` on confirmation
  (REQ-55). It is the one path that always warns: it deliberately discards a kept result and pays
  the full cost.
- Declining the `ConfirmDialog` → closes the whole surface (`onClose`) when there is nothing behind
  it, so the operator is back on the images list with nothing half-opened; when a result **is** on
  screen behind it (a declined re-extraction), it only dismisses the warning and the result stays.
- The extraction progress dialog offers Cancel while active and Close once it ends. Cancel discards
  the run (the intermediate container is still removed server-side) and closes the whole surface,
  returning the operator to the images list — never to a surface offering to start it again. Close,
  once succeeded, only dismisses the dialog and the browsed tree stays; Close, once failed, closes
  the surface.
- A failed extraction is reported as a toast carrying the daemon's own message, once per failure;
  the dialog states none and keeps the progress where the extraction stopped
  (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-7). It is never auto-dismissed, and it
  keeps its **retry as a dialog action, beside `Close`** (`TransferProgressDialog`'s `onRetry`):
  pressing it re-raises the cost warning rather than starting an extraction directly, so the cost is
  announced before every extraction that actually starts.
- Once the extraction succeeds the dialog states `Completed` — the shared surface's own wording, not
  this screen's — and **dismisses itself** a second later, revealing the extracted tree: this view
  asks the surface for that (`autoCloseOnDone`), its result being rendered behind the dialog rather
  than in it. This screen supplies no completion wording, no completion state and no timer of its
  own; its `formatCaption` keeps describing the in-flight phase only, and is not consulted once the
  extraction is done. A failed extraction never dismisses itself.
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

- **The shape is decided by a read that costs nothing**, before any surface is raised: no extraction
  is started to find out, and the surfaces are never raised and then hidden once a stream answers
  "from cache". An open that starts no operation raises no operation-progress dialog at all.
- **A reused result raises no progress dialog on this path, while the layer analyses still raise one
  on theirs.** The difference is not an inconsistency: those analyses ask the server to *run* the
  job and learn only from the answer that it was cached, so a dialog is legitimately up while the
  question is outstanding; this flow asks a separate, free question first and therefore never starts
  anything to report on. `TransferProgressDialog`'s completed-and-self-dismissing behaviour is
  unchanged and still governs every dialog this component *does* raise — every first extraction and
  every re-extraction.
- **"Already extracted" is about the image's content, not its tag**: the read is keyed by image id
  (the content digest), so a rebuilt image carrying a familiar tag reads as never extracted and is
  warned about, and the direct-to-tree shape can never serve a stale tree.
- **A kept result that turns out unreadable degrades to the cost warning, never to a dead end**:
  kept results are operator-clearable, so the answer can stop being true between the moment the
  shape is decided and the moment the tree is read; the operator is then offered the extraction with
  its cost.
- One code path for "browse this image's filesystem": the two shapes belong to this component, so
  any caller opening it inherits both without repeating the decision.
- A re-extraction (`force=true`) resets every loaded tree level, the expansion state, the selection
  and the kept result before the new stream starts, so nothing from the previous run is shown
  against the fresh one.
- Closing the whole browser discards this component's state; the server's kept result is what the
  next open of the same image content reads, which is exactly what makes that open shape B.
- No process from the image is ever executed by this component or by what it drives server-side
  (REQ-53).
- The metadata and content panels are driven by direct server reads keyed on the selected path, not
  by the client-side lazily loaded tree levels, so the detail panel is correct even for a search
  match whose ancestor directories have not finished loading yet.
- No raw markup and no styling of its own: every visual element comes from the ui-library, and this
  flow adds no blur surface (it removes a surface and adds none).
- **No pixel height, no length and no style is stated in this component at all.** The two
  `maxHeight="480px"` constants it used to carry — one on the two-pane region, one on the tree —
  are gone rather than reduced: they were themselves the breach of the rule that no size is
  hard-coded outside the library, and a smaller constant would have been the same defect at another
  number. Nothing here scrolls the dialog: the body holds exactly one scroll region, the tree's, plus
  the detail pane's own when a preview is long.
- **No failure panel** (plan-docker_management_app-inline_error_panels/REQ-1): a failed entry read
  is reported as one toast through `useFailureReport`, and where it leaves nothing to show the
  shared "could not be loaded" placeholder stands in the detail pane's place — no cause named, no
  control (…/REQ-3). The retry is the header's; none is offered here (…/REQ-4).

## Dependencies

- ui-library: Modal, BandStack, SplitPane, TreeView, DefinitionList, EmptyState, ConfirmDialog,
  TransferProgressDialog, StatusPill, FieldMessage, Button, Row, Stack, Spinner,
  StreamSearchField, SegmentedControl, TextViewer, HexDumpViewer, triggerDownload, useToast
- useImageFilesystemKeptResult, useImageFilesystemExtraction, useImageFilesystemTree,
  useImageFilesystemEntryMetadata, useImageFilesystemEntryContent, useImageFilesystemSearch, Image
  filesystem client
- app-shell: useFailureReport, FailedReadEmptyState

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
- plan-docker_management_app-progress_completion_autoclose/REQ-5
- plan-docker_management_app-progress_completion_autoclose/REQ-12
- plan-docker_management_app-progress_completion_autoclose/REQ-15
- plan-docker_management_app-progress_completion_autoclose/REQ-16
- plan-docker_management_app-filesystem_browse_direct/REQ-1
- plan-docker_management_app-filesystem_browse_direct/REQ-2
- plan-docker_management_app-filesystem_browse_direct/REQ-3
- plan-docker_management_app-filesystem_browse_direct/REQ-4
- plan-docker_management_app-filesystem_browse_direct/REQ-5
- plan-docker_management_app-filesystem_browse_direct/REQ-6
- plan-docker_management_app-filesystem_browse_direct/REQ-7
- plan-docker_management_app-filesystem_browse_direct/REQ-8
- plan-docker_management_app-filesystem_browse_direct/REQ-9
- plan-docker_management_app-filesystem_browse_direct/REQ-10
- plan-docker_management_app-filesystem_browse_direct/REQ-11
- plan-docker_management_app-filesystem_browse_direct/REQ-12
- plan-docker_management_app-filesystem_browse_direct/REQ-14
- plan-docker_management_app-filesystem_browse_direct/REQ-15
- plan-docker_management_app-filesystem_browse_direct/REQ-16
- plan-docker_management_app-filesystem_browse_direct/REQ-18
- plan-docker_management_app-filesystem_browse_direct/REQ-19
- plan-docker_management_app-filesystem_browse_direct/REQ-20
- plan-docker_management_app-filesystem_browse_direct/REQ-21
- plan-docker_management_app-filesystem_browse_direct/REQ-22
- plan-docker_management_app-filesystem_browser_layout/REQ-1
- plan-docker_management_app-filesystem_browser_layout/REQ-2
- plan-docker_management_app-filesystem_browser_layout/REQ-6
- plan-docker_management_app-filesystem_browser_layout/REQ-7
- plan-docker_management_app-filesystem_browser_layout/REQ-8
- plan-docker_management_app-filesystem_browser_layout/REQ-9
- plan-docker_management_app-filesystem_browser_layout/REQ-10
- plan-docker_management_app-filesystem_browser_layout/REQ-11
- plan-docker_management_app-filesystem_browser_layout/REQ-12
- plan-docker_management_app-filesystem_browser_layout/REQ-13
- plan-docker_management_app-filesystem_browser_layout/REQ-14
- plan-docker_management_app-filesystem_browser_layout/REQ-15
- plan-docker_management_app-filesystem_browser_layout/REQ-16
- plan-docker_management_app-filesystem_browser_layout/REQ-17
- plan-docker_management_app-filesystem_browser_layout/REQ-18
- plan-docker_management_app-filesystem_browser_layout/REQ-21
- plan-docker_management_app-filesystem_browser_layout/REQ-22
- plan-docker_management_app-filesystem_browser_layout/REQ-23
- plan-docker_management_app-filesystem_browser_layout/REQ-24
- plan-docker_management_app-filesystem_browser_layout/REQ-26
- plan-docker_management_app-inline_error_panels/REQ-5
- plan-docker_management_app-inline_error_panels/REQ-7
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-3
- plan-docker_management_app-inline_error_panels/REQ-4
