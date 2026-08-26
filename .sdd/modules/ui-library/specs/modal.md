---
module: ui-library
component: Modal
type: UI component
---

# Modal

**Purpose** → the base overlay dialog every modal/drawer content in the application is built from.

## Contract

- `<Modal open title children? actions? onClose size? closeControl? restoreFocus?>`
  - `open` — when `false`, renders nothing.
  - `onClose` — called when the dimmed overlay is clicked; content clicks do not propagate to it.
  - `actions` — optional trailing action row (e.g. Cancel/Confirm buttons).
  - `size`: `'default' | 'large'` (default `'default'`) — `'large'` widens the dialog and caps its
    height with its own scroll, for richer content (e.g. a data table) that would not fit the
    default short-message/form width.
  - `closeControl?: boolean` (default `false`) — presents one labelled close control on the dialog's
    own chrome, beside the title, with the accessible name `Close dialog`; operating it calls
    `onClose`. It is reachable by pointer and by keyboard, and it is the dialog's first focusable
    element.
  - `restoreFocus?: boolean` (default `false`) — on dismissal, by **every** route the dialog offers,
    the point of interaction returns to whatever held it when the dialog opened. Where that element
    no longer exists, it goes to the nearest dismissal focus target enclosing it
    (`escape-arbitration.md`); where neither exists, nothing is focused.
  - `fluidWidth?: boolean` (default `false`) — modifies `size="large"` and nothing else: the width
    keeps the format's viewport term and drops its constant cap, so it goes on widening with the
    viewport (`92vw`) instead of stopping at 1100px. Asked for on any other size it does nothing.

## Rules and invariants

- **The dialog's positioner states the width and the content fills it, so the glass card and the
  content it holds cannot disagree** — in either direction, at either size, at any viewport. There is
  no band of empty glass beside the content, and no content outside the surface holding it; the card
  is the box that carries the designed width (480px ordinary, `min(1100px, 92vw)` at `'large'`,
  `92vw` at `'large'` with `fluidWidth`) and the content column is that width less the glass's own
  hairline border on each side. A dialog's width therefore never depends on the length of its copy or
  on runtime data: every ordinary dialog in the application presents at one common width, and long
  and short content differ only in height.
- Why the rule is written this way: stating the width on the content instead, as a `min(…, 100%)`,
  made the card adopt the content's max-content width — a percentage is treated as `auto` in
  intrinsic sizing, so the `100%` term drops out when the fit-content positioner asks the content for
  its contribution.
- **Retuning a dialog width means editing that one declaration**, and never re-splitting the width
  across two elements: the moment two boxes are sized by independent rules the disagreement is back.
- **A screen needing a dialog width of its own is a new requirement and a new decision.** A width
  variant is added to this component deliberately; it is never introduced on a screen and never
  discovered by a test.
- **`fluidWidth` is that decision, taken once, on 2026-08-26, for one surface**
  (`plan-docker_management_app-containers_card_view-detail_modal/REQ-18`, amended by the human). The
  container detail is a screen's worth of property lists, and those lists arrange themselves by the
  width of the box they are given (`content-columns.md`): capped at 1100px the detail showed the same
  two columns at 1280, 1920 and 2560 alike, where the inline panel it replaced — which took the
  frame's width — showed four and five. Losing a column the operator had is an observable difference,
  which REQ-4 makes a defect, so the designed-width rule gave way for this surface rather than the
  other way round.
- **It drops the cap and keeps everything else**, which is why it is a modifier and not a third size:
  the height is still bounded by the viewport with the content scrolling inside the card, the card is
  still exactly the size of its content with no band of empty glass beside it, and the element still
  carries `ui-modal--size-large`. **A dialog that does not ask for it is untouched** — the CSS rule is
  compounded with the large format's own class, so it is inert elsewhere and independent of source
  order, and the image diff, layer explorer, layer efficiency and filesystem browser dialogs keep
  `min(1100px, 92vw)` exactly.
- Measured in Chromium against the built stylesheet: the card is 1177.6 / 1766.4 / 2355.2px at
  1280 / 1920 / 2560, its content 50px less (the glass hairline and the dialog's own inset), and the
  ten-property section carries 2 / 4 / 6 columns there. Below the phone breakpoint nothing changes at
  all — `92vw` is already the operative term of the capped format at 375px.
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
- **That gate reads the dialog's content, not its API**, and the consequence is worth knowing before
  it surprises someone: any future `'large'` dialog that happens to nest a `BandStack` **at any
  depth** inherits the column layout silently, without asking for it and without naming it at the
  call site. Accepted rather than overlooked — a dialog holding an arrangement is exactly the dialog
  that needs to hand its height down, so the sniff and the intent coincide today. A dialog that
  wanted the arrangement *without* the column layout would be the signal to make this an explicit
  choice on the dialog instead.
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
- **Both presentations are opt-in, and a dialog that asks for neither renders exactly what it
  rendered before they existed**: the bare title, no close control, no focus return. They are asked
  for by the caller and by nothing else, so adding one to a surface is a decision taken at that
  surface — never a default drifted into and never acquired by every dialog at once.
- **`closeControl` answers the rule `container_detail_close` states, one surface over**: the control
  is present exactly where it is the only labelled way out, and absent where the gesture that opened
  the surface also closes it. A dialog whose opening gesture is underneath it — covered by the scrim
  — cannot be that gesture, which is what makes the control required there.
- **The dialog's ways out are unchanged in number**: the dimmed overlay, and the close control where
  one was asked for. `Escape` is not one of them, at either size, with or without the control.
- **The focus return happens while the dialog is being dismissed, not after**, and it resolves the
  enclosing dismissal focus target **when the dialog opens** rather than when it closes: an element
  detached from the document leads to no ancestor, so a fallback looked up at dismissal time would
  find nothing exactly when it is needed.
- **`Escape` closes no dialog** — unchanged — **and, while a dialog is open, dismisses nothing behind
  it either.** An open dialog holds the innermost claim on the key (`escape-arbitration.md`) and does
  nothing with it, so a dismissible surface on the screen the dialog covers is not dismissed out from
  under it. Closing the dialog withdraws the claim and the key goes back to whatever claims it.

## Dependencies

- Surface, Overlay glass material, IconButton
- Escape arbitration (the `Escape` claim, and the dismissal focus target the focus return falls back
  to)
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
- plan-docker_management_app-containers_card_view-detail_modal/REQ-10
- plan-docker_management_app-containers_card_view-detail_modal/REQ-14
- plan-docker_management_app-containers_card_view-detail_modal/REQ-17
- plan-docker_management_app-containers_card_view-detail_modal/REQ-18
