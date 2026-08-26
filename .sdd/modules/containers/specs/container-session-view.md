---
module: containers
component: ContainerSessionView
type: UI component
---

# ContainerSessionView

**Purpose** → the exec/attach view: for `exec`, a launch form opens a new interactive session with
the chosen command/shell, user and working directory; for `attach`, an explicit action attaches to
the running container's own stdio. Either way, once connected a live terminal is shown, with a
detach/close action and a session-ended state.

## Contract

Description:

- before a session is active: for `kind="exec"`, a shell picker (bash/sh/custom command), user and
  working-directory fields, and a launch action; for `kind="attach"`, only an attach action.
- once active: a session header (title, connection state, detach/close action) above a terminal that
  takes the height the region this view is placed in leaves it; once the session ends, an overlay
  over the dimmed terminal states why, with a "Close" action returning to the pre-session state.
- when the container is not running, an empty state explains that exec/attach need a running
  container, instead of the form/terminal.

Props:

- `<ContainerSessionView container kind />`
  - `kind: 'exec' | 'attach'`.

Actions:

- "Launch session" / "Attach" → opens the session (for `exec`, using the form's command/user/
  working-directory values).
- Session header's detach/close action → closes the session without affecting the container.
- Session-ended overlay's "Close" → returns to the pre-session state (the launch form for `exec`,
  the attach action for `attach`).

## Rules and invariants

- Unmounting the view (e.g. switching tabs) closes any active session.
- The session surface asks the library for its **fill** mode (`session-chrome.md`) and states no
  length of its own, so the terminal is as tall as the surface carrying the view allows. Only its
  size follows from that: the session, the launch form, the controls, the connection states and the
  ended state are unchanged.
- A custom exec command is run as `/bin/sh -c "<command>"`; a preset shell (`bash`, `sh`) is run
  directly.

## Dependencies

- ui-library: Terminal, SessionHeader, SessionEndedOverlay, SessionSurface, Select, TextField,
  Button, EmptyState
- useContainerSession

## Requirements served

- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-3
