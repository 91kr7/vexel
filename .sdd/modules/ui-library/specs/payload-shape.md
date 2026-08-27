---
module: ui-library
component: Payload shape
type: UI behaviour
---

# Payload shape

**Purpose** → the shape reading of an arbitrary JSON payload, from which a rendering of it and a find
over it are both derived: what a value is, whether it holds anything, how much it holds, how the
payload's own top-level keys divide into sections, and the flattening a filter reads.

Domain-agnostic: it names no product vocabulary of any area, fetches nothing and renders nothing.

## Contract

- `payloadKind(value) → 'scalar' | 'object' | 'array'`
  - an array is `array`, a non-null object is `object`, everything else — `null` included — is
    `scalar`.
- `isEmptyPayloadValue(value) → boolean`
  - `true` for `null`, `undefined`, `""`, `[]` and `{}`, and for nothing else;
  - `false` for `0`, `false` and `"0"`, which are values and never emptiness.
- `payloadCount(value) → number` — a node's own count: the items of an array, the fields of an
  object, `0` for a scalar.
- `payloadLiteral(value) → string` — the scalar as the text the payload carries: a string as itself,
  a number and a boolean as written, `null` as `null`; a composite yields the empty string, never
  stringified JSON.
- `payloadFields(value) → { key, value }[]` — what a node holds:
  - an object → one entry per field, **in the payload's own key order**, keyed by the key;
  - an array → one entry per item, keyed by its position as `[0]`, `[1]`, …;
  - a scalar → nothing.
- `splitTopLevelKeys(payload) → { scalars, sections }` — the payload's top-level keys, each list in
  the payload's own order: every scalar value in `scalars`, every object or array in `sections`.
- `payloadPathKey(path) → string` — a path addressed as one string, two different paths never keying
  alike.
- `flattenPayload(payload) → { path, key, kind, literal }[]` — the whole tree in pre-order, composite
  nodes included, each addressable by its path from the payload's root.
- `matchPayload(nodes, term) → { visiblePaths, matchCount }`
  - a node **matches** when its own key name, or its literal, contains `term` — case-insensitively,
    the term trimmed;
  - `matchCount` is how many nodes matched;
  - `visiblePaths` holds every matching node, **every ancestor that leads to one**, and **everything a
    matching composite holds**, so a match deep inside an array is reachable from the section that
    carries it and a matched object is read with its fields;
  - an empty or blank term matches nothing and yields no paths: "no filter" is the caller's state,
    not a match of everything.

## Rules and invariants

- **Every function is pure and total**: no value throws, none is rejected, and a payload of any depth
  or shape is read. A key the reader has never seen is read exactly like one it has.
- **The payload's own order is never re-ordered** — no alphabetical, no hand-written order anywhere.
- **Nothing is altered**: no value is truncated, masked, rounded or re-encoded, so what a caller
  draws from this reading is what the payload carried.

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-4
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-6
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-8
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-10
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-14
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-21
