---
module: images
component: ImageDetailPanel
type: UI component
---

# ImageDetailPanel

**Purpose** → an image's inspect surface: structured data plus the raw payload.

## Contract

- `<ImageDetailPanel image onClose />` — `image: ImageSummary` identifies which image's inspect data
  to load (via `useImageInspect(image.id)`); `onClose: () => void` is called when the panel is
  dismissed: by `Escape`, or by the screen when the owning row is selected again.

Description:
- A `DetailPanel` showing a `DefinitionList` of id, tags, digest, platform(s), size, created
  timestamp, entrypoint, command and exposed ports, then collapsible `Environment`, `Labels` and
  `History` sections, then the raw payload in a `CodeViewer` (REQ-40).
- Each property section states **only its content class**, and nothing else about layout: the nine
  properties take the default short scalar, `Environment` and `Labels` declare long single-line, and
  `History` declares free text — a Dockerfile instruction against a timestamp label keeps one entry
  per line at full width. How many columns each shows follows from the section's own width
  (`ui-library/content-columns.md`).
- **No close control and no actions at all.** The panel asks the shared `DetailPanel` for the
  presentation whose opening gesture also closes it (`dismissal="opening-gesture"`), so the `✕` is
  gone and nothing replaces it — no collapse link, no chevron, no rendered keyboard hint, and no
  space kept where the glyph sat. The action slot is **omitted**, not emptied, so the header keeps no
  strip, gap or padding where the four analysis buttons sat: this panel presents data and nothing
  else, exactly as the container panel's header does. That is the intended end state, not an
  unfinished region.
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

## Rules and invariants

- The raw payload section always shows the inspect response exactly as received, unmodified.
- The panel offers no operation on the image and initiates no flow. The layer explorer, the
  efficiency/signals view, the filesystem browser and the comparison are the **screen's** views,
  opened from the row's overflow menu (`images-screen.md`); the panel neither renders them nor
  supplies anything to them, and whether it happens to be open has no bearing on any of them.
- Nothing appears in the four buttons' place: no link, no chevron, no tab and no keyboard hint.
- **The file states no column count, no track template, no width, no `style` and no CSS import**, and
  no section's default open/closed state changes with the arrangement.

## Dependencies

- ui-library: DetailPanel, DefinitionList, CollapsibleSection, CodeViewer, SectionHeader,
  EmptyState, ErrorBanner, Stack
- useImageInspect

## Requirements served

- plan-docker_management_app/REQ-40
- plan-docker_management_app-image_row_actions/REQ-20
- plan-docker_management_app-image_row_actions/REQ-24
- plan-docker_management_app-image_row_actions/REQ-25
- plan-docker_management_app-image_row_actions/REQ-26
- plan-docker_management_app-image_row_actions/REQ-27
- plan-docker_management_app-image_row_actions/REQ-31
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-1
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-2
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-3
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-22
- plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-34
- plan-docker_management_app-detail_property_columns/REQ-6
- plan-docker_management_app-detail_property_columns/REQ-15
- plan-docker_management_app-detail_property_columns/REQ-16
- plan-docker_management_app-detail_property_columns/REQ-21
- plan-docker_management_app-detail_property_columns/REQ-27
- plan-docker_management_app-detail_property_columns/REQ-31
