---
module: ui-library
component: CollapsibleSection
type: UI component
---

# CollapsibleSection

**Purpose** → a titled section of a detail surface that expands/collapses its content (e.g. a
container's environment variables or mounts list).

## Contract

- `<CollapsibleSection title summary? defaultOpen? open? onToggle? children? />`
  - `title: string`.
  - `summary?: ReactNode` — shown next to the title regardless of open state (e.g. an item count).
  - `defaultOpen?: boolean` — initial open state (default `false`), read only while the section is
    uncontrolled.
  - `open?: boolean` — **drives the open state from outside**; given, the section is exactly as open
    as the caller says, pressing the header changes nothing on its own and `defaultOpen` is ignored.
  - `onToggle?: (open: boolean) => void` — the header was pressed, with the state it asks for;
    reported in either mode.
  - `children` render only while open.

## Rules and invariants

- **A caller states `open` or it does not, and the two are never mixed**: a section without `open` is
  uncontrolled and holds its own state, which is what every caller but a find over a payload wants.
- The presentation is identical in both modes: the same header, the same chevron, the same summary.

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-9
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-11
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-19
