---
module: ui-library
component: TreeView
type: UI component
---

# TreeView

**Purpose** → a virtualised, expandable/collapsible tree of nodes (e.g. a browsed image
filesystem): entry-type glyphs (file, directory, symlink), single selection, keyboard navigation,
and a lazily loaded subtree contract — the tree never fetches anything itself, so any subtree can
be loaded on demand by the caller (REQ-52).

## Contract

- `<TreeView rootNodes childrenById loadingIds? expandedIds onToggleExpand selectedId? onSelect?
  maxHeight? rowHeight? emptyState? matchedIds? />`
  - `TreeNode`: `{ id, label, kind: 'file' | 'directory' | 'symlink', meta? }` — `id` is a stable
    identifier unique across the whole tree (e.g. the full path); `meta?` is trailing text (e.g. a
    formatted size).
  - `rootNodes: TreeNode[]` — the top-level nodes, already loaded.
  - `childrenById: Map<string, TreeNode[]>` — a directory's loaded children, keyed by its id;
    absent means not requested yet, rendered with no children shown until the caller supplies them.
  - `loadingIds?: Set<string>` — directory ids currently being loaded; each renders a loading row
    under itself, in place of its (not yet known) children.
  - `expandedIds: Set<string>`, `onToggleExpand(node)` — the caller owns expansion state; a
    directory's caret (click, Enter, or ArrowRight/ArrowLeft on the selected row) calls
    `onToggleExpand`, letting the caller trigger a lazy load the first time a directory is
    expanded.
  - `selectedId?: string`, `onSelect?(node)` — single selection; clicking a row (or Enter/Space on
    the keyboard-focused row) calls `onSelect`.
  - `maxHeight?: string` — caps the tree's height and enables virtualised scrolling (only the rows
    in and around the visible window are mounted); unset renders every visible row.
  - `fill?: boolean` (default `false`) — the tree's bound comes from the **region it is placed in**
    rather than from a stated maximum, with virtualisation working exactly as it does under
    `maxHeight`.
  - `rowHeight?: number` — fixed row height in px (default `32`).
  - `emptyState?: ReactNode` — shown instead of the tree when `rootNodes` is empty.
  - `matchedIds?: Set<string>` — ids marked as matching an in-progress search (REQ-60); a matched
    row not currently selected is highlighted in place, distinctly from the selected row.
  - `statusById?: Map<string, 'success' | 'warning' | 'danger'>` — a node's status accent, rendered
    as a small colored dot before its glyph; a node absent from the map renders no accent. Generic
    (not diff-specific): the tree's own dedicated diff composition, `DiffTreeView`, is what actually
    feeds it (REQ-63).

## Rules and invariants

- A node's visible children are exactly `childrenById.get(node.id)` when the node is a directory
  present in `expandedIds`; a file or symlink is never expandable, and a collapsed or not-yet-loaded
  directory shows no children rows.
- Keyboard navigation on the focused tree: ArrowDown/ArrowUp move selection to the next/previous
  visible row (skipping loading rows); ArrowRight expands a collapsed selected directory;
  ArrowLeft collapses an expanded selected directory; Enter/Space selects the focused row and, for a
  directory, also toggles its expansion.
- Virtualisation follows `DataTable`'s own approach: fixed `rowHeight` windowing over the flattened
  visible-row list, with overscan, so scrolling a large tree never mounts every row at once.
- **`fill` preserves virtualisation**: the window is measured from the scroll container itself rather
  than from a parsed length, and it follows that container as the container follows the screen — a
  screen that grows mounts the rows it has just made room for. A tree of hundreds of entries still
  mounts only the rows in and around the visible window.
- **In `fill`, a selection or a search hit is brought into *this* container's window, and into no
  other.** No ancestor is scrolled, which is what keeps a search hit from scrolling the dialog the
  tree sits in; letting the browser reveal the row would scroll every one of them, and the row a
  search jumped to is, in any case, not mounted at all until this happens.
- **The reveal happens once per change of selection, and a row already inside the window moves
  nothing.** Everything else the tree does leaves the scroll position exactly where it is:
  **expanding a directory, collapsing one, and a lazy load arriving move nothing** while the
  selection is unchanged. The operator scrolled to that directory to ask for its children, and its
  children have to appear where they are looking — the tree is not entitled to return them to a
  selection made earlier. (Keyed on the row count instead, the reveal fired on every one of those
  three: measured, an expansion carried a tree from `scrollTop` 960 back to 0 and took the expanded
  directory off the screen.)
- A reveal that cannot yet be performed — a search hit whose ancestor directories are still loading,
  so the row it named does not exist yet — **stays pending** and is completed by the load that brings
  the row in. It is still one reveal for that one selection.
- The delivered `maxHeight` path — including the absence of that reveal — is **preserved exactly**
  for callers that do not ask for `fill`. Row height, density and keyboard navigation are the same in
  both modes.

## Dependencies

- ScrollArea, Spinner

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app-filesystem_browser_layout/REQ-18
- plan-docker_management_app-filesystem_browser_layout/REQ-25
- plan-docker_management_app-filesystem_browser_layout/REQ-26
- plan-docker_management_app/REQ-60
- plan-docker_management_app/REQ-63
