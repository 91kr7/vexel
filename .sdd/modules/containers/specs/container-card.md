---
module: containers
component: ContainerCard
type: UI component
---

# ContainerCard

**Purpose** → one container presented as one card: identity and actions, then provenance, then live
metrics — the presentation the containers list is built from.

## Contract

- `<ContainerCard container lifecycleActions overflowEntries selected onSelect renameControl? />`
  - `container: ContainerSummary`.
  - `lifecycleActions: RowAction[]` — the container's three lifecycle slots, in order: the
    state-appropriate run/halt action, then `Pause`, then `Restart`. The card decides none of them
    and changes none of them.
  - `overflowEntries: MenuEntry[]` — the entries of the trailing overflow menu, in their order.
  - `selected` / `onSelect()` — whether this card is the selected one, and what selecting it does.
  - `renameControl?` — rendered **in the name's place** while this container is being renamed;
    absent, the name is shown.

Description:
- Three bands inside one `Card`, in this order on every card and in every state, with a
  state-coloured accent bar down the card's left edge running its full height.
- The card takes the width of the track it is placed in — a third of the list at desktop width, not
  the page — and it states no width, no height and no minimum of its own. Its height follows its
  content; the grid it stands in is what equalises the cards of a row (`layout-primitives.md`).

Shows:
- **Band 1**, at the left in reading order: the status dot, the container name as the card's most
  prominent text (or `renameControl` in its place), the state pill in uppercase (`RUNNING`,
  `PAUSED`, `EXITED`, and every other state by the same rule), and the short container id in muted
  monospace. At the right, vertically centred with that group: the primary lifecycle action, a gap,
  then `Pause` · `Restart` · `…` joined into one segmented cluster ending flush at the card's inner
  right edge.
- **Band 2**, at the left in reading order: the `image <reference>` chip (`image` muted, the
  reference the chip's value), the port chips — present only when the container reports at least one
  port — and the daemon's own status sentence in muted plain text. Up to three ports are chips of
  their own; past that the remainder is one trailing `+n` chip.
- **Band 3**: the metric strip, **stacked** — one metric per row at any width, not three columns
  side by side.
  - `CPU` over `MEMORY` over `NET I/O`, in that order: `CPU` and `MEMORY` tracked, `NET I/O`
    carrying `in` and `out` and no bar.
  - `CPU` → `<n.n>%` with `of <onlineCpus> core(s)`, the track filled against `onlineCpus × 100`.
  - `MEMORY` → the usage formatted, with `of <limit>`, the track filled against the limit; with no
    limit the track draws the "no measurable maximum" state and no capacity note.
  - `NET I/O` → `in <bytes>` and `out <bytes>`.
  - Any of those with no sample reads `—`, `no sample` in the capacity note's place, and an empty
    track.

Actions:
- clicking the card anywhere outside its action cluster → `onSelect()`.
- the four action slots → their own `onClick` / `onSelect`, and never also `onSelect()` on the card.

## Rules and invariants

- **The card owns none of its own material.** The box, the hover and selected highlights and the
  accent edge are the library `Card`'s, which takes them from the object table's own tokens. This
  file writes no colour, radius, spacing, shadow, font size or z-index, emits no raw DOM tag and
  imports no stylesheet.
- **One rule maps state to presentation, and the dot, the pill and the accent always agree.** Every
  state the product can display has an entry — `created`, `restarting`, `removing` and `dead`
  included, not only the three the mock drew: `running` → success, `paused`/`restarting` → warning,
  `dead` → danger, `created`/`removing`/`exited` → neutral. The metric fills take that same tone.
  No card ever shows two states at once.
- **Ports are worded exactly as the delivered list worded them**, published and merely exposed
  alike: `publicPort→privatePort` where the port is published, the bare `privatePort` where it is
  only exposed. Both kinds, because no value the delivered row showed may disappear from the card
  (REQ-12); the chips are present when there is at least one port of either kind, and no chip is
  ever truncated or reworded.
- **At most three ports are drawn, the rest becoming one `+n` chip** (REQ-5, as reversed on
  2026-08-25). The split is at **four**, not three: a container reporting exactly four draws four
  chips, because a fourth chip costs precisely what the chip announcing it would and a `+1` is never
  worth drawing. The full set stays one click away in the detail panel, so nothing is lost — only
  moved. This is a **deliberate reversal** of the earlier "every mapping, wrapping, none summarised"
  decision, which was taken for a card at full width; at a third of the page one container's port
  list set the height of every card beside it.
- The first slot is the **affirmative** control where the container is not running (`Start`,
  `Resume`) and a quiet one where it is (`Stop`). That is a weight, and only a weight: the action in
  the slot, its position and its legality are the caller's and are unchanged.
- The card shows no age of any sample, and nothing on it is animated, transitioned or tweened
  between samples: a value that changes is redrawn where it stood.
- Block I/O and PIDS are deliberately absent; they stay in the detail panel.
- At 375×812 it carries the **same values** as at desktop width: the card is alone on its row, the
  metrics are stacked as they already are at every width, the action cluster wraps onto its own line
  keeping its order and its segmented geometry, and the provenance chips wrap. Nothing is hidden and
  nothing is scrolled sideways.
- This is one of exactly two feature files admitted by name to draw a surface per object
  (`check-ui-conformance.mjs`, 2026-08-25); its path is part of that admission and moving it fails
  the build.

## Dependencies

- ui-library: Card, Stack, Row, StatusDotCell, SectionHeader, Badge, IdentifierCell, Chip,
  FieldMessage, ActionButtonGroup (with its Menu), MetricStrip
- Containers client (`ContainerSummary`, `ContainerPort`, `ContainerState`)

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-2
- plan-docker_management_app-containers_card_view/REQ-3
- plan-docker_management_app-containers_card_view/REQ-4
- plan-docker_management_app-containers_card_view/REQ-5
- plan-docker_management_app-containers_card_view/REQ-6
- plan-docker_management_app-containers_card_view/REQ-7
- plan-docker_management_app-containers_card_view/REQ-8
- plan-docker_management_app-containers_card_view/REQ-9
- plan-docker_management_app-containers_card_view/REQ-11
- plan-docker_management_app-containers_card_view/REQ-12
- plan-docker_management_app-containers_card_view/REQ-13
- plan-docker_management_app-containers_card_view/REQ-14
- plan-docker_management_app-containers_card_view/REQ-16
- plan-docker_management_app-containers_card_view/REQ-18
- plan-docker_management_app-containers_card_view/REQ-19
- plan-docker_management_app-containers_card_view/REQ-20
- plan-docker_management_app-containers_card_view/REQ-22
- plan-docker_management_app-containers_card_view/REQ-27
- plan-docker_management_app-containers_card_view/REQ-31
- plan-docker_management_app-containers_card_view/REQ-34
- plan-docker_management_app-containers_card_view/REQ-35
- plan-docker_management_app-containers_card_view/REQ-53
