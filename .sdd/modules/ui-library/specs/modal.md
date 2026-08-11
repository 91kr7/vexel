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

## Dependencies

- Surface, Overlay glass material

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-108
- plan-liquid_glass_overlays/REQ-1
- plan-liquid_glass_overlays/REQ-2
- plan-liquid_glass_overlays/REQ-15
