---
module: ui-library
component: Menu
type: UI component
---

# Menu

**Purpose** → the interface's overflow menu: one control that reads as "there is more here" and, on
demand, a popup of labelled entries. Generic and domain-agnostic — it knows what an entry looks
like, never what one does.

## Contract

- `<Menu label entries glyph? />`
  - `label: string` — the accessible name of the trigger (e.g. `More actions for web-1`); it also
    names the open menu.
  - `entries: MenuEntry[]` — `{ id, label, hint?, destructive?, separated?, disabled?,
    disabledReason?, onSelect }`.
  - `glyph?: string` — the trigger's visible character, `…` by default. It is decoration: the
    accessible name is always `label`.

Description:
- A single trigger control sized like the dense row buttons it overflows, and — while open — a
  popup of entries on the overlay glass material, drawn over whatever it covers.
Shows (the trigger):
- Its glyph, its accessible name, that it opens a menu, and whether that menu is currently open.
  It is one stop in tab order.
Shows (each entry):
- Its `label`, always in words — no entry is icon-only.
- `hint`, when given, as secondary text alongside the label (e.g. the technical name of the
  operation the entry runs). It is the entry's accessible description, never part of its name.
- `destructive` entries in the interface's destructive tone, kept in that tone whether or not they
  are disabled.
- `separated` entries preceded by a separator, setting them and what follows apart as a group from
  the entries above. Ignored on the first entry, which has nothing above it.
- A `disabled` entry inert and stated as disabled, with `disabledReason` shown on the entry, offered
  on hover and read as its accessible description. It stays in place and in order: an entry that
  does not apply is never removed.
Actions:
- Activating the trigger (pointer, `Enter`, `Space`, `ArrowDown`/`ArrowUp`) opens the menu and moves
  focus onto its first entry.
- `ArrowDown` / `ArrowUp` move between entries and wrap around; `Home` / `End` jump to the first and
  last. Disabled entries are reached like any other, so their reason can be read. These keys, and
  `Escape`, act on the open menu wherever the focus happens to be — an arrow key takes the focus
  back into the menu rather than needing it there already.
- Activating an entry runs its `onSelect`; a disabled entry's is never run, by pointer or by
  keyboard.
- Choosing an entry, `Escape`, `Tab` and a click outside the popup all close it and return focus to
  the trigger. After `Tab` the focus then moves on from the trigger, as if the menu had never
  opened. A click outside does whatever it would have done — it is never swallowed — but it does not
  take the focus: the dismissal keeps it, and hands it back to the trigger.
- Opening the trigger's own control while the menu is open closes it.

## Rules and invariants

- **An open menu is a claimant of `Escape`, not a listener of its own** (`escape-arbitration.md`):
  while it is open it holds the innermost claim, so a menu opened over a dismissible surface takes
  the key and closes alone — the surface underneath stays as it was and is dismissed by the *next*
  `Escape`, never by the same one. The claim does not depend on where the focus sits, which is what
  keeps the reason the handling was never bound to the popup: an open menu can lose the focus and
  must still close.
- **At most one menu is open in the whole interface**: opening one closes any other, without
  disturbing the focus the new one takes. This is what makes the popup's overlay material legal —
  the count of surfaces carrying it is one, whatever the number of triggers on screen
  (`overlay-glass.md`).
- **The popup is never clipped.** It is rendered outside every scroll and overflow ancestor of its
  trigger and positioned against the trigger's box, flipping above it when there is no room below
  and staying inside the viewport horizontally. A table, a panel or a scroll container between the
  trigger and the edge of the viewport cannot cut it.
- **The popup is drawn at its place from the first frame and is never presented as invisible.** It
  is positioned against the trigger before it is shown and refined before the browser paints — an
  element a browser treats as invisible cannot take focus, so a popup hidden while it is measured
  would silently refuse the focus opening it gives it, and with it the entire keyboard model.
- **An open menu never floats free of its trigger.** While it is open it follows the trigger's box
  as the surface under it re-renders; a scroll anywhere between the trigger and the viewport, or a
  resize, closes it; and it is gone with its trigger when the trigger is unmounted (a virtualised
  table dropping its row). Focus is deliberately not pulled back to the trigger on a scroll close —
  doing so would scroll it back into view against the operator's own scroll.
- The trigger stops click propagation, so opening a menu inside a table row never also selects the
  row; so does the popup, so does choosing an entry.
- The trigger carries no overlay material and computes no filter: there is one of it per row of a
  list of any length. The popup carries the material by asking `Surface` for `material="overlay"` —
  it declares no blur of its own and introduces no second blur value.
- **Every entry is shown, in full, at the sizes the product's menus are actually built at.** Being
  outside every clipping ancestor is only half of it: the popup's own list caps its height at
  `--menu-max-height` and scrolls past it, and an entry below that fold is as hidden as a clipped
  one — the last of them being the destructive entry, by the grouping the menus here follow. The
  token is therefore sized above the tallest menu the product builds, so the cap is a last resort
  against a popup taller than the screen rather than something a menu meets in normal use. A menu
  that outgrows it wants splitting into fewer entries, not a taller cap.
- The popup's entries scroll inside the surface, never the surface itself, so the material's blur
  layer cannot scroll away from what it blurs.
- Labels, hints, reasons and the destructive tone all use text roles whose contrast on glass is
  already verified (`design-tokens.md`); a disabled entry is dimmed by dropping to the secondary
  text role rather than by a transparency, so its reason stays readable.
- Knows nothing of any domain: no data fetching, no vocabulary of its own beyond "entry".

## Dependencies

- Escape arbitration
- Surface (`material="overlay"`)
- Design tokens (`--menu-min-width`, `--menu-max-height`, `--z-modal`, the spacing, radius and text
  roles)

## Requirements served

- plan-docker_management_app-container_row_actions/REQ-7
- plan-docker_management_app-container_row_actions/REQ-8
- plan-docker_management_app-container_row_actions/REQ-9
- plan-docker_management_app-container_row_actions/REQ-10
- plan-docker_management_app-container_row_actions/REQ-11
- plan-docker_management_app-container_row_actions/REQ-12
- plan-docker_management_app-container_row_actions/REQ-13
- plan-docker_management_app-container_row_actions/REQ-14
- plan-docker_management_app-container_row_actions/REQ-15
- plan-docker_management_app-container_row_actions/REQ-16
- plan-docker_management_app-container_row_actions/REQ-17
- plan-docker_management_app-container_row_actions/REQ-25
- plan-docker_management_app-container_row_actions/REQ-26
- plan-docker_management_app-container_detail_close/REQ-7
