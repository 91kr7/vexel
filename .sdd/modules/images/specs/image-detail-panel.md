---
module: images
component: ImageDetailPanel
type: UI component
---

# ImageDetailPanel

**Purpose** → an image's inspect surface: structured data plus the raw payload.

## Contract

- `<ImageDetailPanel image images onClose />` — `image: ImageSummary` identifies which image's
  inspect data to load (via `useImageInspect(image.id)`); `images: ImageSummary[]` is every local
  image, offered as the other side of a comparison; `onClose` closes the panel.

Description:
- A `DetailPanel` (own close control, "Explore layers…", "Browse filesystem…" and "Compare with…"
  header actions) showing a `DefinitionList` of id, tags, digest, platform(s), size, created
  timestamp, entrypoint, command and exposed ports, then collapsible `Environment`, `Labels` and
  `History` sections, then the raw payload in a `CodeViewer` (REQ-40).
Shows:
- An `EmptyState` while loading or when no inspect data is available; an `ErrorBanner` with retry on
  failure.
Actions:
- "Explore layers…" → opens the `LayerExplorer` for this image (REQ-47).
- "Browse filesystem…" → opens the `FilesystemBrowser` for this image (REQ-52).
- "Compare with…" → opens the `ImageDiffView` with this image pre-picked as the first side (REQ-63);
  disabled when `images` holds fewer than two images (nothing to compare against).
Navigation:
- The layer explorer, the filesystem browser or the diff view opens over the panel and closes back
  to it.

## Rules and invariants

- The raw payload section always shows the inspect response exactly as received, unmodified.

## Dependencies

- ui-library: Button, DetailPanel, DefinitionList, CollapsibleSection, CodeViewer, SectionHeader,
  EmptyState, ErrorBanner, Stack
- useImageInspect
- LayerExplorer, FilesystemBrowser, ImageDiffView

## Requirements served

- plan-docker_management_app/REQ-40
- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-63
