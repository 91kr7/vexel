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
  session has ended, presenting the terminal behind it dimmed.
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

- `SessionEndedOverlay` does **not** carry the overlay glass material and declares no runtime blur:
  it is a plain dim over the ended session, and it states the absence explicitly rather than by
  omission (plan-liquid_glass_overlays/REQ-16). It covers the whole session surface, at that
  surface's own geometry and radius, and its message and action stay legible over it.
- The reason it is a dim, so that nobody restores the blur believing it an oversight: the overlay is
  `inset: 0` over the entire terminal region, so a blur on it reads as the terminal having gone out
  of focus rather than as a card of glass floating over the session — the objection that keeps both
  scrims off the allow-list (`overlay-glass.md`), one scale down. A terminal is also the worst
  backdrop for it: small monospace glyphs on a near-uniform dark field smear at 20px into a flat
  rectangle in which no glass is legible. The blur was implemented, seen and withdrawn.
- The overlay is a stacking context of its own (`z-index`), so it paints above the terminal it
  covers and below nothing else in the region.
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
