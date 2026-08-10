---
module: ui-library
component: ToastProvider, useToast
type: UI component
---

# Toast

**Purpose** → transient, non-blocking notifications stacked bottom-right.

## Contract

- `<ToastProvider children>` — renders its children plus the toast viewport; must wrap any part of
  the tree that calls `useToast()`.
- `useToast(): { push(toast) }` — `toast`: `{ title, message?, tone?, durationMs? }`;
  `tone`: `'neutral' | 'success' | 'danger'`; a pushed toast auto-dismisses after `durationMs`
  (default 5000ms).
- Calling `useToast()` outside a `ToastProvider` throws.

Shows:
- at most **three** toasts at once, newest last. Pushing a fourth drops the oldest immediately, so
  the fourth is on screen and the first is gone.

## Rules and invariants

- Toasts never block interaction with the rest of the screen or navigation (REQ-8).
- Each toast's surface carries the overlay glass material: it renders a blurred image of whatever
  it covers, with the same treatment as the dialog surfaces and the same fallbacks
  (`overlay-glass.md`).
- The cap of three is what bounds the number of blurred surfaces the compositor can be asked for at
  one moment (plan-liquid_glass_overlays/REQ-10) — it is the one overlay surface whose count is not
  naturally one.
- A toast dropped by the cap, or dismissed before its time, takes its pending auto-dismissal with
  it: it never dismisses a toast that took its place, and its remaining time never shortens
  another's.

## Dependencies

- Surface, Overlay glass material

## Requirements served

- plan-docker_management_app/REQ-8
- plan-liquid_glass_overlays/REQ-3
- plan-liquid_glass_overlays/REQ-10
