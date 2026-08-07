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
- `SessionEndedOverlay` — a centered message (and optional action) dimming the terminal once the
  session has ended.
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
  `overlay` is rendered on top of it, dimmed, when given.

## Rules and invariants

- No blur is applied to the overlay; it is a translucent wash over the terminal, static.
- `SessionSurface`'s height is a fixed value, never derived from its content: hosting a `Terminal`
  inside an unbounded, content-driven height would grow every time the terminal's fit adds rows,
  which its resize observer would then see as a resize and fit again, without ever settling.

## Dependencies

- Button, StatusPill

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
