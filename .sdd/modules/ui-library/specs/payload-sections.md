---
module: ui-library
component: PayloadSections
type: UI component
---

# PayloadSections

**Purpose** → an arbitrary JSON payload drawn as the payload's own shape: sections from its top-level
keys, groups from its nested objects, counted items from its arrays and a label → value band for
every leaf. It is what makes "everything the payload holds is on screen" a rendering rather than a
list somebody wrote out by hand.

Domain-agnostic: it carries no product vocabulary, makes no request and knows what no key means —
a reading of a value is supplied by the caller.

## Contract

- `<PayloadSections payload reading? scalarsTitle? openKeys? onToggleSection? defaultOpenKeys?
  visiblePaths? trailing? />`
  - `payload: unknown` — the value to draw.
  - `reading?: (path, value) => { node?, tone? } | undefined` — consulted for **every** node,
    composite ones included; `node` is drawn beside the value, `tone` (`danger`) draws the literal
    itself as bad news. Returning nothing is the normal case.
  - `scalarsTitle?: string` — the heading of the leading section; defaults to `Fields`.
  - `openKeys?: readonly string[]` — the open sections, keyed by top-level key or by the exported
    `PAYLOAD_SCALARS_SECTION`. Given, the sections are controlled and every toggle is reported
    through `onToggleSection(key, open)`; omitted, each section holds its own state, opened per
    `defaultOpenKeys`.
  - `visiblePaths?: ReadonlySet<string>` — when present, **only** the paths it holds are drawn.
  - `trailing?: ReactNode` — drawn after every payload-derived section.

Description:
- One section per composite top-level key, labelled with that key, plus **one leading section
  gathering every top-level scalar**. The sections follow the payload's own key order, the gathered
  scalars first; no other ordering is imposed.
- Every section is independently collapsible and states what it holds beside its title — `n fields`
  for an object or for the gathered scalars, `n items` for an array, singular at one.

Shows (inside a section):
- a **nested object or array** as a labelled group: its key, its own count, its fields indented under
  a rule, to whatever depth the payload goes;
- an **array item** identified by its position (`[0]`, `[1]`, …), so an array of scalars reads as
  separate items and an array of objects gives each item a group of its own;
- a **leaf** as a label → value band: the key name as the label, the payload's literal beside it, and
  the caller's reading — when it gives one — beside that;
- an **empty value** (`null`, `""`, `[]`, `{}`) in its own place, marked as empty and naming what is
  empty: `empty (null)`, `empty (text)`, `empty (list)`, `empty (object)`. A section whose whole value
  is empty draws that marker as its body rather than an empty body.

Actions:
- pressing a section's header opens or closes it, and nothing else on the surface is a control.

## Rules and invariants

- **A field the payload holds is drawn, whether or not it holds anything** — this component
  deliberately does not apply `plan-ui-coherence-optimisation/REQ-60`: "this list is empty" is an
  answer, and an absent group is not that answer. A field the payload does **not** hold is nowhere.
- **`0`, `false` and `"0"` are drawn as themselves** and are never marked empty.
- **No value is ever stringified JSON**: a composite is a group or a list, at any depth.
- **Nothing is truncated, clamped, masked or hidden behind a reveal** — a value is drawn in full and
  wraps at the payload's own token boundaries (`payload-wrapping.md`), so a long one is read and
  selected rather than scrolled to sideways.
- **No copy affordance of any kind**: no button, no menu entry, no click-to-copy. Selection with
  mouse and keyboard is the only route to a value.
- **The reading never replaces the literal**: both are on the band, and a caller returning a reading
  for a key it recognises changes nothing about what the payload said.
- At a narrow width the band **stacks label over value** instead of clipping either, and a nested
  group keeps its indent, so nothing on the surface requires horizontal scrolling.
- The component states no width, no height and no column count.

## Dependencies

- Payload shape, Payload wrapping, CollapsibleSection

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-3
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-6
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-8
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-9
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-10
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-11
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-13
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-14
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-15
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-17
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-23
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-24
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-27
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-29
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-35
