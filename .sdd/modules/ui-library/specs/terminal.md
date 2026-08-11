---
module: ui-library
component: Terminal
type: UI component
---

# Terminal

**Purpose** → the interactive terminal surface for exec/attach sessions, themed to the library's
tokens. The documented `CLAUDE.md` escape hatch: it wraps the third-party xterm.js emulator, which
must render into and own a host element it manages internally; this is the only place in the client
aware of that emulator.

## Contract

Description:

- a single host region that renders whatever bytes it is given as a live terminal grid — cursor,
  selection, scrollback — sized to fill its container (a `SessionSurface`, whose height is fixed, not
  content-driven) and refit whenever that container's own size changes.

Props:

- `<Terminal ref onInput? onResize? />`
  - `ref: TerminalHandle` — `{ write(data: string), focus(), dispose() }`. `write` renders output
    bytes/text received from a session into the terminal.
  - `onInput?: (data: string) => void` — fires with raw keystroke/paste bytes as the operator types.
  - `onResize?: (cols: number, rows: number) => void` — fires with the character grid size whenever
    it is computed (on mount and on every host resize).

Shows:

- the terminal grid themed with the library's monospace font, text and accent color tokens, over a
  transparent background (the surrounding surface provides the glass material).

## Rules and invariants

- No feature code touches the emulator directly: everything it needs is the typed `ref` and the two
  callbacks above.
- **Every keystroke typed into the terminal belongs to the session, `Escape` included.** The host is
  declared a region owning its own keystrokes (`escape-arbitration.md`), so no dismissible surface
  around it — a detail panel hosting the session, for instance — is ever resolved by a key the
  session was meant to receive: the key reaches the session and the surface stays as it is. The
  guarantee is the library's own and is **not** delegated to the emulator calling `preventDefault()`:
  the failure it prevents is silent, a session that has quietly stopped receiving one key still
  looking exactly like a working session.
- The terminal's character grid is refit to its host's size continuously (via a resize observer), so
  `onResize` also reflects layout changes, not only an initial mount. Because the host is only ever
  given a fixed-height container (`SessionSurface`), a fit settles instead of feeding back into
  another resize.
- The host itself computes no `backdrop-filter`/`filter: blur()`: it is translucent, and it stays
  main view, sharp, for as long as the session runs (plan-liquid_glass_overlays/REQ-7). Nor does
  anything drawn above it blur it: the `SessionEndedOverlay` shown once the session has ended is a
  plain dim by decision, and declares as much (see `session-chrome.md`,
  plan-liquid_glass_overlays/REQ-16). The terminal is never blurred, before or after the session
  ends.

## Dependencies

- xterm.js (`@xterm/xterm`, `@xterm/addon-fit`) — third-party, wrapped per the escape hatch above.
- Escape arbitration (as a region owning its keystrokes)

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app-container_detail_close/REQ-8
