---
module: ui-library
component: Escape arbitration
type: UI behaviour
---

# Escape arbitration

**Purpose** → the one place that decides which surface an `Escape` belongs to. A dismissible surface
claims the key while it is open; a region may declare the keystrokes typed inside it its own. One
keystroke resolves at most one surface.

## Contract

- `claimEscape(handle) → withdraw()` — registers a claim on `Escape` and answers the function that
  withdraws it.
- `useEscapeClaim(active, onEscape)` — holds a claim for as long as `active` is true and withdraws it
  when it turns false or the component unmounts. `onEscape` receives the keyboard event, so the
  claimant decides for itself whether to prevent the key's default.
- `ownKeystrokes(region) → withdraw()` — declares an element a region owning the keystrokes typed
  inside it.
- `useKeystrokeRegion(ref)` — the same, for the referenced element, while the component is mounted.
- `DISMISSAL_FOCUS_TARGET_ATTRIBUTE` — the attribute a region carries to declare itself the place the
  point of interaction returns to when a surface inside it is dismissed by the key.
- `focusDismissalTarget(from) → boolean` — moves the focus to the nearest enclosing region carrying
  that attribute, and answers whether one was found.

Delivery of one `Escape`:

```
if the keystroke's origin is inside a region that owns its keystrokes → deliver to nobody
else if there is at least one standing claim → deliver to the most recently registered one, only
else → deliver to nobody, and let the key through untouched
```

## Rules and invariants

- **The innermost claimant is the most recently registered one**, and it is the only one the key
  reaches. A menu opened over an open panel takes the `Escape`; the panel is untouched and takes the
  next one. Two surfaces never resolve on one keystroke.
- **Registration order is the definition of "innermost", never a race for the key.** There is exactly
  one document-level listener for the whole interface: a second one would fire for the same keystroke
  and be won by whichever surface registered first — the surface opened *earliest*, which is the
  defect this component exists to prevent. `event.defaultPrevented` and `stopPropagation` do not
  repair that; they rename it.
- **A region that owns its keystrokes is answered before any claimant**, so an `Escape` typed into a
  live terminal or interactive session reaches the session and no surface around it is dismissed. The
  guarantee is this component's, not the hosted widget's: it does not depend on the widget calling
  `preventDefault()`.
- **With no claim standing, the key is left entirely alone**: no listener is bound at all, nothing is
  prevented, nothing is swallowed. The listener is installed with the first claim and removed with
  the last.
- A claim survives a re-render of the surface that holds it: the handler is read at delivery time, so
  rendering never re-orders the claims.
- A claimant may consume the key and do nothing with it — which is how a dialog keeps its own
  behaviour (`Escape` closes no dialog in this product) while making sure nothing underneath it is
  dismissed behind it.
- **No surface in the client watches the document for `Escape` on its own**, and the claimants are
  named here so the statement can be checked rather than believed: `Menu` while its popup is open,
  `Frame`'s phone navigation drawer while it is open, `Modal` (and everything built on it) and
  `FormSheet` while they are open — both consuming the key and doing nothing with it — and
  `DetailPanel` in its control-less presentation. The one region owning its keystrokes is
  `Terminal`'s host. A surface that binds `keydown` on the document or the window for `Escape` is a
  counter-example to this component's entire purpose, not an alternative implementation of it.
- The one handler outside the registry is `Combobox`'s, and it is deliberately left there: it sits on
  the field's own element, closes that field's popup only, and can dismiss nothing around it, so it
  arbitrates against nobody. It also does not stop the key: a claimant standing above it still
  receives it.
- Domain-agnostic: it knows "a claimant" and "a region that owns its keys", never a panel, a menu or
  a container. It is internal to the library and is not re-exported from the public entry point.

## Dependencies

- None.

## Requirements served

- plan-docker_management_app-container_detail_close/REQ-5
- plan-docker_management_app-container_detail_close/REQ-7
- plan-docker_management_app-container_detail_close/REQ-8
- plan-docker_management_app-container_detail_close/REQ-9
- plan-docker_management_app-container_detail_close/REQ-10
- plan-docker_management_app-container_detail_close/REQ-11
