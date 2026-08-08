---
module: images
component: ImageDetailPanel
type: UI component
---

# ImageDetailPanel

**Purpose** → an image's inspect surface: structured data plus the raw payload.

## Contract

- `<ImageDetailPanel image onClose />` — `image: ImageSummary` identifies which image's inspect
  data to load (via `useImageInspect(image.id)`); `onClose` closes the panel.

Description:
- A `DetailPanel` (own close control, "Explore layers…" and "Browse filesystem…" header actions)
  showing a `DefinitionList` of id, tags, digest, platform(s), size, created timestamp, entrypoint,
  command and exposed ports, then collapsible `Environment`, `Labels` and `History` sections, then
  the raw payload in a `CodeViewer` (REQ-40).
Shows:
- An `EmptyState` while loading or when no inspect data is available; an `ErrorBanner` with retry on
  failure.
Actions:
- "Explore layers…" → opens the `LayerExplorer` for this image (REQ-47).
- "Browse filesystem…" → opens the `FilesystemBrowser` for this image (REQ-52).
Navigation:
- The layer explorer or the filesystem browser opens over the panel and closes back to it.

## Rules and invariants

- The raw payload section always shows the inspect response exactly as received, unmodified.

## Dependencies

- ui-library: Button, DetailPanel, DefinitionList, CollapsibleSection, CodeViewer, SectionHeader,
  EmptyState, ErrorBanner, Stack
- useImageInspect
- LayerExplorer, FilesystemBrowser

## Requirements served

- plan-docker_management_app/REQ-40
- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-52
