---
module: ui-library
component: PayloadExplorer
type: UI component
---

# PayloadExplorer

**Purpose** → a payload drawn as its own shape (`payload-sections.md`) with **one find over the whole
of it**: a surface of collapsed sections without one is a worse raw dump than the raw dump, and on
several hundred fields marking the matches still leaves them to be scrolled to — so the find
**filters**.

## Contract

- `<PayloadExplorer payload reading? scalarsTitle? defaultOpenSections? trailing? findPlaceholder?
  findLabel? />`
  - `payload`, `reading`, `scalarsTitle` — handed to `PayloadSections` unchanged.
  - `defaultOpenSections?: readonly string[]` — the sections open when the payload is first drawn,
    keyed by top-level key or by `PAYLOAD_SCALARS_SECTION`; also the state clearing the find returns
    to. Defaults to none open.
  - `trailing?: ReactNode` — drawn after every payload-derived section, **and only while the find is
    empty**: a filtered result holds the fields that matched and nothing else.
  - `findPlaceholder?`, `findLabel?` — the words on the find control; both default to English
    wordings naming a field or a value.

Description:
- One search control above the sections, and the sections underneath it.

Shows:
- while the control is **empty** → the whole payload, with `defaultOpenSections` open and every other
  section closed;
- while it **holds text** → only the fields whose key name or literal contains it, every section
  holding a match open — however deeply the match sits — and the count of matches beside the control
  (`n matching fields`, singular at one);
- when it holds text **nothing matches** → an empty state saying so, in place of the sections, rather
  than a blank surface.

Actions:
- typing in the control filters, opens the sections holding matches, and states the count;
- clearing it restores the whole payload **and** the entry section state, not whatever was open
  before the search;
- pressing a section header opens or closes that section, filtering or not.

## Rules and invariants

- **The find reads the whole flattened payload**, not the part currently on screen: a value inside a
  collapsed, deeply nested array is found exactly as a top-level scalar is.
- **The match is on key name and on literal alike**, case-insensitive, the term trimmed.
- **A matching composite is shown with everything it holds**, and every ancestor leading to a match is
  shown so the match keeps its address.
- The flattening is computed once per payload and the match once per term, so a keystroke on a
  payload of hundreds of fields re-reads nothing it has already read.
- The component owns the find and the section state and nothing else: it adds no action, no copy
  affordance and no chrome to what `PayloadSections` draws, and states no width or height.
- At a narrow width the control and its count take separate lines rather than clipping either.

## Dependencies

- PayloadSections, Payload shape, SearchField, EmptyState

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-19
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-20
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-21
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-23
