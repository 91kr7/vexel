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
- The surface never uses `backdrop-filter` or `filter: blur()`.

## Dependencies

- Surface, Button

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
