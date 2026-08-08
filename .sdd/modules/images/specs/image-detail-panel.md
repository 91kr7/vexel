---
module: images
component: ImageDetailPanel
type: UI component
---

# ImageDetailPanel

**Purpose** → an image's inspect surface: structured data plus the raw payload.

## Contract

- `<ImageDetailPanel image images onClose layerFocus? />` — `image: ImageSummary` identifies which
  image's inspect data to load (via `useImageInspect(image.id)`); `images: ImageSummary[]` is every
  local image, offered as the other side of a comparison; `onClose` closes the panel.
  - `layerFocus?: { layerIndex?, requestId }` — opens the layer explorer at that layer as soon as it
    arrives, and again on every later `requestId` (REQ-69); changesets stay behind their cost
    warning, since nothing here says they are already cached.

Description:
- A `DetailPanel` (own close control, "Explore layers…", "Efficiency & signals…", "Browse
  filesystem…" and "Compare with…" header actions) showing a `DefinitionList` of id, tags, digest,
  platform(s), size, created timestamp, entrypoint, command and exposed ports, then collapsible
  `Environment`, `Labels` and `History` sections, then the raw payload in a `CodeViewer` (REQ-40).
Shows:
- An `EmptyState` while loading or when no inspect data is available; an `ErrorBanner` with retry on
  failure.
Actions:
- "Explore layers…" → opens the `LayerExplorer` for this image (REQ-47).
- "Efficiency & signals…" → opens the `LayerEfficiencyView` for this image (REQ-65, REQ-66, REQ-67).
- "Browse filesystem…" → opens the `FilesystemBrowser` for this image (REQ-52).
- "Compare with…" → opens the `ImageDiffView` with this image pre-picked as the first side (REQ-63);
  disabled when `images` holds fewer than two images (nothing to compare against).
Navigation:
- The layer explorer, the efficiency/signals view, the filesystem browser or the diff view opens over
  the panel and closes back to it.
- A finding selected in the efficiency/signals view closes it and opens the layer explorer already
  selecting and analyzing the layer it concerns (REQ-65, REQ-67); the layer explorer, once the
  efficiency/signals view has been analyzed at least once, marks every layer carrying a finding.
- A `layerFocus` handed down by the screen opens the layer explorer at that layer, which is how a
  build-cache record's reference lands on the layer it names (REQ-69).

## Rules and invariants

- The raw payload section always shows the inspect response exactly as received, unmodified.

## Dependencies

- ui-library: Button, DetailPanel, DefinitionList, CollapsibleSection, CodeViewer, SectionHeader,
  EmptyState, ErrorBanner, Stack
- useImageInspect
- LayerExplorer, LayerEfficiencyView, FilesystemBrowser, ImageDiffView

## Requirements served

- plan-docker_management_app/REQ-40
- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-66
- plan-docker_management_app/REQ-67
- plan-docker_management_app/REQ-69
