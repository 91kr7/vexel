---
module: ui-library
component: Toggle
type: UI component
---

# Toggle

**Purpose** → boolean on/off switch for a form (e.g. enabling a health check, marking a mount
read-only) or for a state change that has to travel to the daemon (enabling a plugin).

## Contract

- `<Toggle checked onChange label? ariaLabel? disabled? busy? />`
  - `checked: boolean`, `onChange(checked): void`.
  - `label?: string` — rendered next to the switch; also used as the accessible name when
    `ariaLabel` is not given.
  - `disabled?: boolean` — the switch cannot be operated; default `false`.
  - `busy?: boolean` — the change already asked for has not come back yet; default `false`. The
    switch keeps showing the value that is still true, refuses further input, marks itself busy to
    assistive technology and shows a pending indicator.

## Rules and invariants

- A busy switch never shows the value it was asked to change to: only a confirmed change moves it,
  so a refused or failed one never leaves a lie on screen.
- Busy and disabled both block `onChange`; busy also announces the work in flight, disabled does
  not.
- The switch is operated by its track or its label, and from the keyboard once focused: the
  checkbox carrying the state is visually behind the track, so it is reachable and announced but is
  not itself the hit area.

## Dependencies

- Spinner

## Requirements served

- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-111
