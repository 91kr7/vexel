---
batch: 2 · overlay-glass-material
feature: Real liquid glass on the overlay layer — dialogs, toasts, the choice popup, the phone drawer
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-10, REQ-11, REQ-12, REQ-13]
depends: [1]
---

# Batch 2 — The overlay glass material

One material, defined once, opted into by the surfaces that are allowed to carry it. The main view
is not touched: whatever this batch adds must be reachable only by an explicit opt-in, never by the
base glass every panel already uses.

## Baseline (what exists)

- `client/src/ui/tokens.css` — the single source of truth for every visual value, including
  `--color-surface-{1,2,raised,sunken}`, `--color-border-{subtle,strong}`, `--color-highlight-top`,
  the shadows and the `--z-{backdrop,shell,content,overlay,modal,toast}` scale. It holds no blur
  value today.
- `client/src/ui/glass/Surface.tsx` + `surface.css` — `.ui-surface` with `--elevation` variants
  `flat` / `raised` / `sunken` and `--pad-*`. **Shared** between overlay surfaces and every main-view
  panel: the blur must not land on `.ui-surface` itself or on any existing elevation.
- `client/src/ui/feedback/Modal.tsx` — renders `.ui-modal-overlay` (fixed, `inset: 0`,
  `rgba(2,3,6,0.6)`, `--z-overlay`) containing a positioner containing `<Surface elevation="raised">`
  containing `.ui-modal`. `ConfirmDialog`, `FormDialog` and `TransferProgressDialog` are all built on
  it, so treating `Modal` treats them.
- `client/src/ui/feedback/FormSheet.tsx` — the same `.ui-modal-overlay` scrim, its own
  `.ui-form-sheet__positioner` and `<Surface elevation="raised">` containing `.ui-form-sheet`.
- `client/src/ui/feedback/Toast.tsx` — `ToastProvider` keeps `toasts` in state, appends on `push`,
  and schedules `dismiss(id)` at `durationMs ?? 5000` per toast. The stack is **unbounded**. Renders
  `.ui-toast-viewport` (fixed, bottom-right, `--z-toast`) with one `<Surface elevation="raised"
  padding="md">` per toast.
- `client/src/ui/controls/controls.css` — `.ui-combobox__list`, the suggestion popup:
  `position: absolute; top: 100%`, `--z-modal`. The application's only styled popup.
- `client/src/ui/layout/layout.css` — at `@media (max-width: 720px)` the rail leaves the flow:
  `.ui-frame__rail` becomes fixed at `--z-overlay` with a transform slide, and `.ui-frame__scrim`
  becomes a fixed `rgba(0,0,0,0.5)` at `--z-overlay - 1` faded by `opacity`. Above that breakpoint
  the rail is docked and the scrim is `display: none`. `.ui-frame__rail` is a bare sizing wrapper —
  the visible card is `.ui-nav-rail` in `client/src/ui/navigation/navigation.css`.
- `client/src/ui/background/Backdrop.tsx` + `backdrop.css` — the static pre-blurred SVG asset behind
  everything, at `--z-backdrop`. Unchanged by this batch.
- No portal and no overlay root: every overlay renders inline in the React tree and escapes through
  `position: fixed`. No ancestor declares `filter`, `opacity`, `mask`, `mix-blend-mode` or
  `transform`, so each overlay's backdrop root is the document — its blur samples the whole page.
- `client/test/unit/form-sheet.test.tsx` asserts the sheet's surfaces use neither `backdrop-filter`
  nor `filter: blur()`. It contradicts this batch and is rewritten here.
  `console-surface.test.tsx` and `log-stream.test.tsx` assert the same for regions this batch does
  not touch: they stay as they are.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | client, UI library (`client/src/ui/tokens.css`) | Add `--blur-overlay: 20px` with a comment stating it is the **maximum** any surface may use and the only legal blur value in the codebase, plus whatever alpha/border tokens the overlay material needs that the existing `--color-surface-*` set does not already cover (a blurred surface can afford a lower alpha than an unblurred one — if it does, that is a token, not a literal). No existing token changes value: the main view's material must come out byte-identical. | REQ-6 | — |
| INT-2 | create | client, UI library — the glass material area | The overlay glass material, defined in exactly one place and named so `Surface` and the four plain-CSS surfaces below can all opt into it: the token-valued `backdrop-filter`, its `-webkit-backdrop-filter` counterpart for WebKit/Safari, and the translucency, border and highlight that make it read as glass rather than as a frosted rectangle. Guarded on both sides: an `@supports` rule raising the surface to an opaque-enough alpha where backdrop blur is unsupported, so text keeps the contrast `design-tokens.md` already documents and the content behind stays unreadable through it; and a `prefers-reduced-transparency` rule dropping blur and translucency for a fully opaque surface at the same geometry. Export it from the library's public entry point if it is a component; if it is a class, it must still be reachable only by the surfaces listed here. | REQ-1, REQ-11, REQ-12, REQ-13 | INT-1 |
| INT-3 | modify | client, UI library (`client/src/ui/glass/Surface.tsx`, `client/src/ui/glass/surface.css`) | Give `Surface` an explicit, typed opt-in to the overlay material — a new prop with a default that changes nothing — and emit the material's class when it is set. Extend the component, do not add a near-duplicate. Every existing elevation, radius, shadow and highlight stays exactly as it is: a `Surface` rendered without the new prop must produce identical markup and identical computed style to today's. Add the new class to the conformance check's allow-list (`client/scripts/check-ui-conformance.mjs`) and to the allow-list stated in `CLAUDE.md`, which are one list in two places. | REQ-1, REQ-6, REQ-7 | INT-2 |
| INT-4 | modify | client, UI library (`client/src/ui/feedback/Modal.tsx`) | Opt the dialog's `Surface` into the overlay material, so `Modal` and everything built on it — `ConfirmDialog`, `FormDialog`, `TransferProgressDialog` — get it in one move. Both sizes (`default`, `large`) carry it; the `large` variant's own scroll must not change what the blur samples. | REQ-1 | INT-3 |
| INT-5 | modify | client, UI library (`client/src/ui/feedback/FormSheet.tsx`) | The same opt-in for the form sheet's `Surface`. Its footer's `--color-wash-1` strip and its scrolling body sit **on** the blurred surface, not behind it: they must keep reading as one surface, not as a second box. | REQ-1 | INT-3 |
| INT-6 | modify | client, UI library (`client/src/ui/feedback/feedback.css`, `.ui-modal-overlay`) | Leave the dialog scrim a plain dim — no `backdrop-filter`, no change to its colour — and record on the spot why: the application behind an open dialog stays sharp by design, and a blurred scrim would make itself the backdrop root of the dialog nested inside it, so the dialog's own blur would resample an already-blurred layer and pay twice for one effect. This is a deliberate non-change; it must survive the next person who reads the overlay layer and assumes the scrim was forgotten. | REQ-2 | — |
| INT-7 | modify | client, UI library (`client/src/ui/feedback/Toast.tsx`) | Two things, together because they are one surface's behaviour: opt each toast's `Surface` into the overlay material, and cap the visible stack at **three**, the oldest dropped when a fourth arrives. The cap is what bounds how many blurred surfaces the compositor can ever be asked for at once. Mind the timer: each toast's dismissal is scheduled by id, so a toast dropped early by the cap must not later dismiss a different one, and a toast pushed out early must not leave its timeout to fire against an id that has been reused. | REQ-3, REQ-10 | INT-3 |
| INT-8 | modify | client, UI library (`client/src/ui/controls/controls.css`, `.ui-combobox__list`) | Give the suggestion popup the overlay material, so the rows it covers are blurred and their text is not legible through it. Its selected/hovered option states must stay as legible over the blurred material as they are today. | REQ-4 | INT-2 |
| INT-9 | modify | client, UI library (`client/src/ui/layout/layout.css`, `client/src/ui/navigation/navigation.css`) | Inside the `@media (max-width: 720px)` block **only**, give the off-canvas rail card (`.ui-nav-rail`, the surface that actually paints) and the drawer scrim (`.ui-frame__scrim`) the overlay material. Above that breakpoint the docked rail keeps today's material untouched — it is main view. The two are siblings, not nested, so both may blur; they compose while the drawer is open, which is accepted and worth a comment on the spot. The scrim's existing `opacity` fade stays: it creates a backdrop root for its own descendants only, of which it has none. | REQ-5, REQ-7 | INT-2 |
| INT-10 | modify | ui-library module specs (`.sdd/modules/ui-library/specs/`: `design-tokens.md`, `surface.md`, `modal.md`, `form-sheet.md`, `toast.md`, `combobox.md`, `frame.md`, `navigation-primitives.md`) | Bring the contracts in line with the code. `surface.md` and `modal.md` currently state the surface "never uses `backdrop-filter` or `filter: blur(...)` (REQ-108)" and `form-sheet.md` says the same: replace with the narrowed rule — the base material never blurs, the overlay opt-in does, bounded by `--blur-overlay`, with the `@supports` and reduced-transparency fallbacks. Record the new token in `design-tokens.md` with its maximum, the new `Surface` prop in `surface.md`, the three-toast cap in `toast.md`, the popup material in `combobox.md`, and the drawer/scrim material — phone breakpoint only — in `frame.md` and `navigation-primitives.md`. Cite requirements by id (`plan-liquid_glass_overlays/REQ-n`). Update `.sdd/modules/ui-library/index.md` if INT-2 adds a component. | REQ-6, REQ-15 | INT-9 |
| INT-11 | modify | client, unit test tree (`client/test/unit/`, starting from `form-sheet.test.tsx`) | Turn the verification round. `form-sheet.test.tsx`'s "no blur on its surfaces" case becomes its opposite for the sheet's own surface while keeping it for the scrim. Add, at the level jsdom can actually reach — stylesheet text and rendered class names: the overlay material declares the token-valued blur and its `-webkit-` counterpart, an `@supports` fallback and a `prefers-reduced-transparency` variant; `.ui-surface` and its three elevations declare none, and a `Surface` without the opt-in renders without the material's class; the dialog, sheet, toast, popup and phone-drawer surfaces each carry it; `.ui-modal-overlay` does not. Add a behavioural case for the cap: pushing four toasts leaves three on screen, the oldest gone, and the dropped one's timer dismisses nothing else. Leave `console-surface.test.tsx` and `log-stream.test.tsx` alone — they guard regions this batch does not touch. | REQ-1, REQ-2, REQ-3, REQ-7, REQ-10, REQ-11, REQ-12, REQ-13 | INT-10 |

## Constraints

- **The main view must come out identical.** No change to `.ui-surface`'s existing elevations, to
  `.ui-frame__header`, to `.ui-nav-rail` above 720px, to any card, table, detail panel, split pane,
  log, console or terminal surface. The material is reachable only by the opt-in of INT-3 and by the
  four selectors of INT-8/INT-9.
- **One blur value in the whole codebase**: `var(--blur-overlay)`. The conformance check of batch 1
  rejects a literal length; do not work around it.
- **No portal, no overlay root, no change of z-index scale.** The effect must be obtained where the
  overlays already render. If a surface turns out not to sample what is behind it, that is a
  finding to report, not a licence to restructure the shell.
- The UI-library boundary is unchanged: no raw DOM tag, no CSS, no `className`/`style` prop and no
  hard-coded visual value outside `client/src/ui/`.
- Verification is unit-level by decision: stylesheet text and jsdom. jsdom computes no
  `backdrop-filter`, so no test may claim to prove the effect renders. Do not add an e2e check.
- Tests touch neither the Docker daemon nor the network and leave nothing behind — this batch's
  whole surface is the client's UI library and its unit tree.

## Human acceptance

Open any dialog (remove a container → the confirmation): the application behind it stays **sharp**
and merely dimmed, while through the dialog's own surface the content behind it is visibly out of
focus. Same for a long form sheet (create a container) and a transfer dialog (pull an image).
Trigger four toasts in a row: at most three are on screen at once, the oldest giving way to the
fourth, each showing a blurred image of what it covers. Type in a field with suggestions until its
list opens: the rows underneath are blurred and no longer readable through it. Narrow the window
below 720px and open the navigation drawer: drawer and scrim both blur the screen behind them;
widen it again and the docked rail is exactly as before. Everywhere else nothing moved — side by
side with the previous build, cards, tables, headers, detail panels, the log, console and terminal
surfaces are identical. With the system set to reduced transparency, dialogs, toasts and the popup
turn opaque and stay perfectly readable.
