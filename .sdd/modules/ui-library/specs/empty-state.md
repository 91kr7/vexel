---
module: ui-library
component: EmptyState
type: UI component
---

# EmptyState

**Purpose** → placeholder content for a screen, list or panel that currently has nothing to show
(including a screen not yet built by a later batch).

## Contract

- `<EmptyState title description? action? compact? />`
  - `compact?: boolean` (default `false`) — the placeholder is the height of its own content and sits
    at the top of the space it is given, for a placeholder **inside a pane**.

## Rules and invariants

- The default is the full-height, centred presentation, and every screen and list keeps it —
  including a tree's own "nothing here" state, which is a placeholder for a whole listing.
- `compact` changes the presentation and nothing else: same wording, same structure, same API.
- Why the variant exists: in a pane that fills the height it is given, the centred presentation reads
  as a void the pane could not fill rather than as a pane waiting for a selection.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app-filesystem_browser_layout/REQ-10
