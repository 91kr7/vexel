---
module: ui-library
component: Modal
type: UI component
---

# Modal

**Purpose** → the base overlay dialog every modal/drawer content in the application is built from.

## Contract

- `<Modal open title children? actions? onClose size?>`
  - `open` — when `false`, renders nothing.
  - `onClose` — called when the dimmed overlay is clicked; content clicks do not propagate to it.
  - `actions` — optional trailing action row (e.g. Cancel/Confirm buttons).
  - `size`: `'default' | 'large'` (default `'default'`) — `'large'` widens the dialog and caps its
    height with its own scroll, for richer content (e.g. a data table) that would not fit the
    default short-message/form width.

## Rules and invariants

- **The dialog's positioner states the width and the content fills it, so the glass card and the
  content it holds cannot disagree** — in either direction, at either size, at any viewport. There is
  no band of empty glass beside the content, and no content outside the surface holding it; the card
  is the box that carries the designed width (480px ordinary, `min(1100px, 92vw)` at `'large'`) and
  the content column is that width less the glass's own hairline border on each side. A dialog's
  width therefore never depends on the length of its copy or on runtime data: every ordinary dialog
  in the application presents at one common width, and long and short content differ only in height.
- Why the rule is written this way: stating the width on the content instead, as a `min(…, 100%)`,
  made the card adopt the content's max-content width — a percentage is treated as `auto` in
  intrinsic sizing, so the `100%` term drops out when the fit-content positioner asks the content for
  its contribution.
- **Retuning a dialog width means editing that one declaration**, and never re-splitting the width
  across two elements: the moment two boxes are sized by independent rules the disagreement is back.
- **A screen needing a dialog width of its own is a new requirement and a new decision.** A width
  variant is added to this component deliberately; it is never introduced on a screen and never
  discovered by a test.
- The dialog answers its content in height as well: it grows with what it holds, and `'large'` caps
  the height and scrolls inside the content, never on the positioner.
- **A `'large'` dialog whose body holds a `BandStack` hands its own bounded height down to it**, and
  only that kind of dialog does. The cap becomes the card's used height, the body shrinks against it,
  and the arrangement is given the definite height its filling region distributes — which is what
  stops the body from overflowing the card and leaving the card itself scrolling, a second scrollbar
  around content that already has one. Every dialog **without** an arrangement keeps exactly the
  layout it has, which is what leaves the three sibling large dialogs untouched while the library
  grows underneath them. The card's own scroll stays as the backstop for a viewport too short even
  for the chrome.
- The dialog surface is a `raised` Surface carrying the overlay glass material
  (`material="overlay"`): what is behind the dialog shows through it blurred and unreadable, at
  both sizes — `'large'`'s own scroll changes what the dialog contains, never what it samples.
  Narrows the earlier "never `backdrop-filter` or `filter: blur(...)`"
  (`plan-docker_management_app/REQ-108`), which this plan supersedes; the fallbacks the material
  degrades through are in `overlay-glass.md`.
- The dimmed scrim behind the dialog stays a **plain dim** and declares no blur: the application
  behind an open dialog is still sharp outside the dialog's own footprint. Deliberate, and the
  cheaper half of the same decision — the scrim covers the whole viewport, so blurring it would put
  the most expensive surface in the application underneath the dialog's own, two blurs for one
  effect.
- Everything built on Modal — `ConfirmDialog`, `FormDialog`, `TransferProgressDialog` — carries the
  material by construction, none of them declaring it itself.
- **`Escape` closes no dialog** — unchanged — **and, while a dialog is open, dismisses nothing behind
  it either.** An open dialog holds the innermost claim on the key (`escape-arbitration.md`) and does
  nothing with it, so a dismissible surface on the screen the dialog covers is not dismissed out from
  under it. Closing the dialog withdraws the claim and the key goes back to whatever claims it.

## Dependencies

- Surface, Overlay glass material
- Escape arbitration
- BandStack (recognised in the stylesheet, not imported: a `'large'` dialog holding one becomes a
  column so the arrangement has a height to distribute)

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app-container_detail_close/REQ-9
- plan-docker_management_app/REQ-108
- plan-liquid_glass_overlays/REQ-1
- plan-liquid_glass_overlays/REQ-2
- plan-liquid_glass_overlays/REQ-15
- plan-docker_management_app-dialog_sizing/REQ-1
- plan-docker_management_app-dialog_sizing/REQ-2
- plan-docker_management_app-dialog_sizing/REQ-3
- plan-docker_management_app-dialog_sizing/REQ-4
- plan-docker_management_app-dialog_sizing/REQ-5
- plan-docker_management_app-dialog_sizing/REQ-6
- plan-docker_management_app-dialog_sizing/REQ-7
- plan-docker_management_app-dialog_sizing/REQ-8
- plan-docker_management_app-dialog_sizing/REQ-9
- plan-docker_management_app-dialog_sizing/REQ-10
- plan-docker_management_app-dialog_sizing/REQ-11
- plan-docker_management_app-dialog_sizing/REQ-12
- plan-docker_management_app-dialog_sizing/REQ-14
- plan-docker_management_app-dialog_sizing/REQ-15
- plan-docker_management_app-filesystem_browser_layout/REQ-6
