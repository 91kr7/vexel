---
module: ui-library
component: FormSheet
type: UI component
---

# FormSheet

**Purpose** → the dialog surface for a long, sectioned form: header, an always-visible banner slot,
a scrolling body of sections, and a footer that stays in place at the bottom holding cancel plus
one or more commit choices.

## Contract

- `<FormSheet open title description? banner? commitActions busy? busyLabel? cancelLabel? onCancel>`
  - `commitActions: { id, label, onClick, disabled? }[]` — the commit choices, left to right; the
    last one is rendered as the primary action, the others as secondary.
  - `banner?` — content pinned between the header and the body, outside the scrolling area.
  - `busy?` / `busyLabel?` — while `busy`, the primary commit shows `busyLabel`.
  - `children` — the form body; it scrolls when it is taller than the available height.

Shows:
- Nothing at all while `open` is `false`.
- Title, optional description, the banner, the scrolling body and the footer, over a dimmed
  overlay.
Actions:
- a commit action → calls its `onClick`.
- cancel, or a click on the dimmed overlay → calls `onCancel`.

## Rules and invariants

- While `busy`, every commit action and cancel is disabled and the overlay no longer cancels, so an
  in-flight operation cannot be dismissed as if it never started.
- The footer and the banner never scroll out of view, whatever the body's height.
- The sheet's surface carries the overlay glass material: what is behind it shows through blurred
  and unreadable, degrading through the fallbacks stated in `overlay-glass.md`. This narrows the
  earlier "the surface never uses `backdrop-filter` or `filter: blur()`", which this plan
  supersedes.
- The header, the banner, the scrolling body and the footer's own washed strip all sit **on** that
  one blurred surface, not behind it: they keep reading as one sheet, never as a second box drawn
  over the first.
- The dimmed overlay the sheet sits on stays a plain dim and declares no blur, for the reason given
  in `modal.md`.
- `Escape` does not cancel the sheet — unchanged — and, while it is open, dismisses nothing on the
  screen behind it either: the open sheet holds the innermost claim on the key and does nothing with
  it, exactly as `modal.md` describes.

## Dependencies

- Surface, Button, Overlay glass material
- Escape arbitration

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app-container_detail_close/REQ-9
- plan-docker_management_app/REQ-28
- plan-liquid_glass_overlays/REQ-1
- plan-liquid_glass_overlays/REQ-2
- plan-liquid_glass_overlays/REQ-15
