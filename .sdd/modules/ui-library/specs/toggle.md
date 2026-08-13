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
  not itself the hit area. It stays in the tab order (`tabIndex` 0) and Space toggles it; a
  correction that hides it, disables it or removes it from the tab order is refused.
- **Operating the switch with a real pointer leaves the surface it sits on exactly where it was**,
  and leaves the switch itself inside the viewport. The checkbox carrying the state is drawn within
  the switch's own box, so focusing it — which is what a real click does, and what the browser
  answers by scrolling the focused element into view — scrolls nothing.

## Where a hidden control displaces its surface

The condition is sharper than "the control sits inside something that scrolls", and stating it
loosely is what made four consumers look equally suspect when only one was affected:

> a visually hidden, absolutely positioned control is displaced when **the scrolling happens between
> the control and its nearest positioned ancestor** — the ancestor its position is resolved against.
> Where that ancestor is inside the scroller, the control travels with the visible one and nothing
> moves.

Measured at an 813×800 viewport, each consumer measured twice — once as delivered, once with the
switch's own frame of reference neutralised — so "unchanged" is an observation and not a claim:

- **container create form**, "Run privileged" — the affected one. As delivered: hidden checkbox
  10.3px from its track, sheet at `y=32` before the click and `y=32` after. Neutralised: 1346.5px,
  the sheet dragged from `y=32` to `y=-1044` and the switch carried to `y=-579.9`, outside the
  viewport. Its frame of reference had been the sheet's raised surface, with the sheet's scrolling
  body in between.
- **container detail panel**, health-check "Enabled" — measured clean, before and after. Gap 10.3px
  either way, identical track and label boxes, panel at `y=251.3` before and after the click. The
  scrolling area sits outside the panel, which is itself positioned.
- **container logs view**, "Timestamps" — measured clean, before and after, on the same numbers.
  (The panel's own `y` moves 157.6px on that click in **both** builds: the view re-renders to a
  different height when timestamps are turned on. Pre-existing, unrelated to this control, and the
  switch stays inside the viewport.)
- **plugins install dialog** — measured clean before the correction: its frame of reference is the
  modal's own surface, which does not scroll internally; input `y=503` against track `y=494`, dialog
  `y=201.5` before and after.
- **plugins screen, per-row switch** — **not measured**. Measuring it costs a daemon-plugin install
  per run, which the project's fixture rules refuse. It is expected clean by the same condition, and
  expectation is all that is claimed here.

## Dependencies

- Spinner

## Requirements served

- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-111
- plan-docker_management_app-toggle_focus_scroll/REQ-1
- plan-docker_management_app-toggle_focus_scroll/REQ-2
- plan-docker_management_app-toggle_focus_scroll/REQ-3
- plan-docker_management_app-toggle_focus_scroll/REQ-4
- plan-docker_management_app-toggle_focus_scroll/REQ-5
- plan-docker_management_app-toggle_focus_scroll/REQ-6
