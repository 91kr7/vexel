---
module: volumes-networks
component: VolumesNetworksScreen
type: UI component
---

# VolumesNetworksScreen

**Purpose** → the Volumes & networks screen: side-by-side panels, each owning its own header and
actions (REQ-70).

## Contract

- `<VolumesNetworksScreen volumes networksPanel? />`
  - `volumes: VolumesPanelProps` — forwarded to `VolumesPanel`.
  - `networksPanel?: ReactNode` — the Networks panel, supplied by a later batch.

Description:
- A two-column grid holding the Volumes panel and, once supplied, the Networks panel next to it.
Shows:
- The `VolumesPanel` in the first column.
- `networksPanel` in the second column when given.

## Rules and invariants

- The grid renders a single column (the Volumes panel alone, full width) while `networksPanel` is
  not supplied, and two equal columns once it is — so this batch's screen and a later batch's
  Networks panel share the same layout without a further layout change.

## Dependencies

- ui-library: Grid
- VolumesPanel

## Requirements served

- plan-docker_management_app/REQ-70
