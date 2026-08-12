---
module: ui-library
component: Frame
type: UI component
---

# Frame

**Purpose** → the application frame: composes the Backdrop with the rail / header / content /
footer regions so feature code never writes a layout wrapper element itself.

## Contract

- `<Frame rail header footer? children?>`
  - `rail` — rendered as a floating, full-height left panel (a rounded glass island, not flush to
    the viewport edge).
  - `header` — rendered above the content as its own floating rounded panel, flow height.
  - `children` — the active screen, rendered in the scrollable content region.
  - `footer` — optional, rendered below the content.

## Rules and invariants

- Renders exactly one Backdrop, behind the rail/header/content/footer.
- The frame is a fixed `height: 100vh` flex row with `overflow: hidden`: the page itself never
  scrolls. The rail and the content region each scroll independently within that fixed height, so
  the rail, the header and the footer stay in place while the content scrolls (REQ-2).
- The whole shell is inset from the viewport with a uniform gap (`--space-5`) and the same gap
  separates rail / header / content, so the Backdrop is visible through the gaps — every region
  (rail, header, content cards) is its own floating glass panel rather than a flush, edge-to-edge
  chrome. This is a deliberate departure from the checked-in mock's flush/docked shell (human
  decision, 2026-08-06), matching the reference glass style requested for the app.
- The scrollable content region must not clip its cards' shadows, and its cards must share the
  header card's exact left/right bounds. Two things work against that and both are handled
  (2026-08-06): (a) `overflow-y: auto` computes `overflow-x` to `auto`, so a scroll container clips
  every side — hardest at the top, where content can never scroll above the scroll origin, which
  sliced the first card's shadow off flat; the region therefore carries padding on all four sides
  for shadow bleed, cancelled by an equal negative margin (top/left/right) so nothing moves
  visually. (b) The reserved scrollbar gutter (`scrollbar-gutter: stable`) is real layout space
  taken out of the content area, which would leave the cards narrower than the header. The gutter's
  width is **not knowable from CSS** — it varies by browser/platform, and `scrollbar-width: thin`
  makes the engine ignore the `::-webkit-scrollbar` pixel width (measured 11px where the stylesheet
  declared 8px). Frame therefore measures the real gutter at runtime
  (`offsetWidth - clientWidth`, re-measured on resize) and publishes it as `--scrollbar-width` on
  the content element, which the stylesheet subtracts from the right padding. The token in
  `tokens.css` is only the pre-measurement fallback.
- The rail is placed visually first via CSS `order` (not DOM order): `children`/`rail` markup order
  stays content-first for reading/tab order, `order: -1` on the rail wrapper puts it on the left
  regardless of DOM position — the same independence from DOM order the previous grid-based layout
  achieved with explicit `grid-column`/`grid-row`.
- Below the phone breakpoint (`720px`) the rail leaves the flex flow and becomes an off-canvas
  drawer: `position: fixed`, inset from the viewport edges by `--space-3` on open, translated fully
  off-screen when closed, sliding on a `transform` transition. A menu-toggle button (rendered by
  Frame itself, inside the header row) opens/closes it; a dimmed scrim covers the content while
  open. The drawer closes on: activating the toggle again, tapping the scrim, pressing Escape, or
  activating any `button`/`a` inside the rail (event-delegated, so a nav-entry selection closes it
  without Frame knowing about routing). Between `720px` and `1024px` the rail stays docked but
  narrows (`260px` → `220px`). This transient open/close transition is ordinary UI chrome, not the
  Backdrop layer — the CLAUDE.md animation ban targets the static background image, not a drawer.
- **The open drawer is a claimant of `Escape`, not a listener of its own** (`escape-arbitration.md`).
  While it is open it holds the innermost claim, so one `Escape` closes the drawer and leaves a
  dismissible surface on the screen behind it exactly as it was — that surface takes the next one,
  never the same one. The key is not prevented, as it never was. Above the phone breakpoint the rail
  is docked, no drawer exists, and nothing is claimed.
- That scrim is a **plain dim and declares no blur**, and says so explicitly rather than by
  omission. It spans the whole viewport, so blurring it would not blur a panel — it would blur the
  entire main view, background asset included, which is the cost the blur policy exists to refuse.
  Behind an open drawer the application stays sharp and merely dimmed, exactly as it does behind an
  open dialog (`modal.md`). Above the breakpoint the scrim is not displayed at all.
- The surface that blurs is the drawer card (`.ui-nav-rail`, see `navigation-primitives.md`), and it
  alone: the content it covers is out of focus through it, the rest of the screen is not.
- The rail's sizing wrapper carries no material of any kind, blurred or not: it is a plain box, and
  a blurred rectangle behind the card's rounded corners is exactly what it would produce.

## Dependencies

- Backdrop, Overlay glass material
- Escape arbitration

## Requirements served

- plan-docker_management_app-container_detail_close/REQ-7
- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-117
- plan-liquid_glass_overlays/REQ-5
- plan-liquid_glass_overlays/REQ-7
