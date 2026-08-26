---
module: containers
component: ContainerIdentityHeader
type: UI component
---

# ContainerIdentityHeader

**Purpose** → one container's identity as a dialog's title: the same reading the operator was looking
at on the card when they decided to open it, plus the health outcome the card leaves to the daemon's
sentence.

## Contract

Description:
- one line of identity, composed from library primitives alone, meant to be handed to a dialog as its
  title rather than drawn on a surface of its own; it carries no surface, no chrome and no dismissal.

Shows, in this order:
- the container's state as a dot
- the container's name, on its own — **no `Container — ` prefix**, and no other qualifier
- the container's state as a pill, in the state's own tone
- the container's health outcome as a pill, **only when the daemon states one**
- the container's short id

Actions:
- none: every element of it is a statement, and nothing in it is operable.

## Rules and invariants

- **The tone of the dot and of the two pills, and whether there is a health outcome at all, are the
  module's one shared reading** (`container-status.md`) — the same one the card reads, so the header
  cannot disagree with the card it was opened from.
- **The state pill states the container's state**, uppercased exactly as the card states it.
- **The health pill exists only when that reading states an outcome**, and when it does not there is
  **nothing at all in its place** — no empty pill, no placeholder, no gap held open for it.
- **It asks the daemon for nothing**: the outcome comes out of the status sentence the summary
  already carries, and the component issues no request, holds no state and subscribes to nothing.
- **It states what it is given and nothing else.** A caller handing it the last summary known for a
  container that has ceased to exist gets that identity drawn, unchanged; the component neither
  invents a state nor empties itself.
- **The name gives way before its neighbours do**: a long name ellipsises on one line rather than
  pushing the pills, the short id or the dialog's close control out of place, and at a narrow
  viewport the line wraps instead of clipping or scrolling sideways.

## Dependencies

- Row, StatusDotCell, SectionHeader, Badge, IdentifierCell (ui-library)
- Container status reading (the state's tone and the health outcome)
- Containers client (the container summary shape it is given)

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-6
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-8
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-9
