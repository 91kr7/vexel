---
module: ui-library
component: TextField, SearchField
type: UI component
---

# TextField, SearchField

**Purpose** → the library's single-line text input primitive, and its full-width search/filter
variant for a screen toolbar.

## Contract

- `<TextField value onChange placeholder? ariaLabel? onSubmit? autoFocus? ref? />` — `onSubmit` fires
  on Enter; `ref` reaches the field itself.
- `<SearchField value onChange placeholder? ariaLabel? ref? />` — a `TextField` at full width,
  default placeholder `'Search…'`.
  - `ref` exposes `{ focus() }` and nothing else: a caller can send the cursor to the field — an
    empty state whose way out is to type a term — without reaching into the field it stands for.

## Decisions recorded

- **The focus handle belongs to the library, not to the screen that first needed it.** It was added
  for one call site (`RegistriesScreen`'s `Search Docker Hub` empty state, REQ-38, whose resolving
  action *is* "put the cursor in the search box"), and the temptation is to keep such a thing local.
  It cannot be local: an empty state's action is a control in feature code, feature code owns no DOM
  — it may neither render an `input` nor hold one — and the only other ways out are for the screen to
  reach into the library's markup, or for the library to grow a second, differently-shaped mechanism
  the next time a screen needs the same thing. So the field states what may be done to it from
  outside, in the library's existing shape for exactly this (`Terminal`'s handle): a named handle
  with the one verb, `focus()`, and no access to the element behind it.
- **`TextField` forwards a real element ref, `SearchField` does not.** The forwarding is an
  intra-library detail — it is how `SearchField` reaches the input it renders — and it stops at the
  boundary: what leaves the library is the handle, never the `HTMLInputElement`. A screen that finds
  itself wanting the element wants a capability this contract does not have, and the answer is a new
  verb on the handle.

## Requirements served

- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-23
