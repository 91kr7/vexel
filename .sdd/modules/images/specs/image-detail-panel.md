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
  local image, offered as the other side of a comparison; `onClose: () => void` is called when the
  panel is dismissed: by `Escape`, or by the screen when the owning row is selected again.
  - `layerFocus?: { layerIndex?, requestId }` — opens the layer explorer at that layer as soon as it
    arrives, and again on every later `requestId` (REQ-69); changesets stay behind their cost
    warning, since nothing here says they are already cached.

Description:
- A `DetailPanel` with "Explore layers…", "Efficiency & signals…", "Browse
  filesystem…" and "Compare with…" header actions showing a `DefinitionList` of id, tags, digest,
  platform(s), size, created timestamp, entrypoint, command and exposed ports, then collapsible
  `Environment`, `Labels` and `History` sections, then the raw payload in a `CodeViewer` (REQ-40).
- **No close control, but a populated action bar.** The panel asks the shared `DetailPanel` for the
  presentation whose opening gesture also closes it (`dismissal="opening-gesture"`), so the `✕` is
  gone and nothing replaces it — no collapse link, no chevron, no rendered keyboard hint, and no
  space kept where the glyph sat. Where it differs from the container panel: the four actions below
  are the image's own analyses, panel actions rather than row actions, and they stay.
Shows:
- An `EmptyState` while loading or when no inspect data is available; an `ErrorBanner` with retry on
  failure.
Actions (dismissal):
- `Escape` closes the panel, from wherever the focus sits inside its own contents, and the point of
  interaction is left on the images list region rather than on the removed subtree or on the
  document.
- The owning row closes it too, by being selected again (`images-screen.md`).
- Arbitrated innermost-first: with the row's overflow menu open, `Escape` closes the menu only and
  the next one closes the panel; with the layer explorer, the efficiency/signals view, the
  filesystem browser, the comparison, the create-and-run form, the tag/untag/push dialogs or the
  remove confirmation open, `Escape` leaves the panel exactly as it was. With no panel open the key
  changes nothing on the screen.
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
- The four header actions are unchanged by the loss of the close control: same four, same order,
  same behaviour, `Compare with…` still unavailable below two images.

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
- plan-docker_management_app-image_row_actions/REQ-20
- plan-docker_management_app-image_row_actions/REQ-21
- plan-docker_management_app-image_row_actions/REQ-24
- plan-docker_management_app-image_row_actions/REQ-25
- plan-docker_management_app-image_row_actions/REQ-26
- plan-docker_management_app-image_row_actions/REQ-27
- plan-docker_management_app-image_row_actions/REQ-31
