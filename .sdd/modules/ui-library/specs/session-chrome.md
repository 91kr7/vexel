---
module: ui-library
component: SessionHeader, SessionEndedOverlay, SessionSurface
type: UI component
---

# SessionHeader, SessionEndedOverlay, SessionSurface

**Purpose** → chrome around an interactive terminal session: a header naming the session and its
connection state with a disconnect/detach action, an overlay stating why a session ended, and the
positioning surface that lays one over the other.

## Contract

Description:

- `SessionHeader` — a title, a connection-state pill and an optional trailing disconnect/detach
  button, in a row above the terminal.
- `SessionEndedOverlay` — a centered message (and optional action) over the terminal once the
  session has ended, presenting the terminal behind it blurred.
- `SessionSurface` — wraps a `Terminal` (or its launch-form placeholder) in a fixed-height region and
  positions an optional `SessionEndedOverlay` over it.

Props:

- `<SessionHeader title state disconnectLabel? onDisconnect? />`
  - `state: 'connecting' | 'open' | 'closed' | 'error'` — drives the pill's label and tone
    (`connecting`/`closed` neutral, `open` success, `error` danger).
  - `disconnectLabel?`/`onDisconnect?` — both required together to show the trailing action; it is
    disabled once `state` is `'closed'`.
- `<SessionEndedOverlay message action? />` — `action` is typically a "Close" button.
- `<SessionSurface overlay?>{children}</SessionSurface>` — `children` is the terminal content;
  `overlay` is rendered on top of it when given.

## Rules and invariants

- `SessionEndedOverlay` carries the overlay glass material (see `overlay-glass.md`): the ended
  session is rendered **blurred** underneath it, not merely washed out, and the material's fill,
  its no-backdrop-blur fallback and its reduced-transparency variant come with it
  (plan-liquid_glass_overlays/REQ-16). It covers the whole session surface, at that surface's own
  geometry and radius, and its message and action stay sharp and legible over the blur.
- There is **one** of these overlays per session view, and only while a view whose session has
  ended stays open. It is one of the two blurred surfaces that live inside the scrolled content
  flow — a knowingly accepted risk against `plan-docker_management_app/REQ-109`, recorded in
  `plan-liquid_glass_overlays/requirements.md`, and the batch that is withdrawn first if scrolling
  regresses.
- What the overlay blurs is a sibling inside its own region rather than the page behind an overlay
  layer, so the overlay is a stacking context of its own: without one, the material's blur layer
  would be painted underneath the terminal and would blur what is behind the session instead of the
  session. It is a stacking context and not a backdrop root, so the material's nesting invariant is
  untouched.
- `SessionSurface`'s height is a fixed value, never derived from its content: hosting a `Terminal`
  inside an unbounded, content-driven height would grow every time the terminal's fit adds rows,
  which its resize observer would then see as a resize and fit again, without ever settling.

## Dependencies

- Button, StatusPill, Overlay glass material

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
- plan-liquid_glass_overlays/REQ-16
