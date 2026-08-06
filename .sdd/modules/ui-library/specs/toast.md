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

## Rules and invariants

- Toasts never block interaction with the rest of the screen or navigation (REQ-8).

## Dependencies

- Surface

## Requirements served

- plan-docker_management_app/REQ-8
