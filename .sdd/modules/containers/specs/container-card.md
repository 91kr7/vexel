---
module: containers
component: ContainerCard
type: UI component
---

# ContainerCard

**Purpose** → one container presented as one card: identity, then state, then what it is made of,
then how it is doing and how it is reached, with its actions in a band of their own at the bottom —
the presentation the containers list is built from.

## Contract

- `<ContainerCard container lifecycleActions overflowEntries onOpenDetail renameControl? />`
  - `container: ContainerSummary`.
  - `lifecycleActions: RowAction[]` — the container's three lifecycle slots, in order: the
    state-appropriate run/halt action, then `Pause`, then `Restart`. The card decides none of them
    and changes none of them.
  - `overflowEntries: MenuEntry[]` — the entries of the trailing overflow menu, in their order.
  - `onOpenDetail()` — what the top-right control does: open this container's detail. The card has no
    selected state and takes none.
  - `renameControl?` — rendered **in the name's place** while this container is being renamed;
    absent, the name is shown.

Description:
- One `Card` with a state-coloured accent bar down its left edge, running its full height, holding
  **five content bands then a footer**, in this order on every card and in every state: identity →
  state and duration → image → metrics (`CPU`, `MEMORY`, `NET I/O`, `PORTS`) → the actions.
- The card takes the width of the track it is placed in — a third of the list at desktop width, not
  the page — and it states no width, no height and no minimum of its own. Its height follows its
  content; the grid it stands in is what equalises the cards of a row (`layout-primitives.md`).

Shows:
- **Identity** — at the left: the status dot and the container name as the card's most prominent
  text (or `renameControl` in its place). At the right, anchored to the card's inner right edge: the
  short container id in muted monospace, then the control that opens the container's detail in a
  dialog. **The name gives way**, truncating with an ellipsis when the row cannot hold both; **the id
  never truncates**.
- **State and duration** — the state pill in uppercase (`RUNNING`, `PAUSED`, `EXITED`, and every
  other state by the same rule) followed by the daemon's own status sentence in muted plain text
  (`Up 3 hours`, `Paused 12 minutes ago`, `Exited (0) 2 hours ago`), so the state and how long it has
  held read as one sentence.
- **Image** — a full-width `image <reference>` field of its own (`image` muted, the reference in
  monospace) sharing its line with nothing. A reference too long for the line **truncates at the
  front**, keeping `name:tag` and losing the registry host.
- **Metrics** — the metric strip, **stacked**: one metric per row at any width.
  - `CPU` over `MEMORY` over `NET I/O` over `PORTS`, in that order: `CPU` and `MEMORY` tracked,
    `NET I/O` carrying `in` and `out` and no bar, `PORTS` carrying chips and no bar.
  - `CPU` → `<n.n>%` with `of <onlineCpus> core(s)`, the track filled against `onlineCpus × 100`.
  - `MEMORY` → the usage formatted, with `of <limit>`, the track filled against the limit; with no
    limit the track draws the "no measurable maximum" state and no capacity note.
  - `NET I/O` → `in <bytes>` and `out <bytes>`, on the row's own line.
  - `PORTS` → one accented chip per port, right-aligned, **on one line**; `none` where the
    container reports no port at all, so the row keeps its shape either way.
  - Any tracked metric with no sample reads `—`, `no sample` in the capacity note's place, and an
    empty track.
- **The footer** — the actions, set apart from everything above by a hairline and their own ground:
  the primary lifecycle action at the left, and at the right `Pause` · `Restart` · `…` joined into
  one segmented cluster ending flush at the card's inner right edge. **All four controls are one
  height**, the segmented cluster's included, so the cluster reads as one boundary
  (`action-button-group.md`); the footer sits on the card's bottom edge whatever the card's height,
  the stretch slack of a card shorter than its row-mates opening above the hairline and never below
  it.

Actions:
- the detail control → `onOpenDetail()`, by pointer and by keyboard alike. It is the card's only
  route into the detail.
- the four action slots → their own `onClick` / `onSelect`, and none of them ever opens the detail.
- clicking the card's body — its name, its image line, its metrics, anywhere outside those five
  controls → **nothing at all**.

## Rules and invariants

- **The card owns none of its own material.** The box, the accent edge, the footer's ground and
  hairline, the front-truncating image field and the metrics' rhythm are all the library's, which
  takes them from the object table's own tokens; the hover and selected highlights are the library's
  too and this card no longer asks for them. This file writes no
  colour, radius, spacing, shadow, font size or z-index, emits no raw DOM tag and imports no
  stylesheet.
- **The arrangement above is `.sdd/analysis/ui-mock/containers-refactor-b3.png`'s** and governs from
  2026-08-25; `containers-refactor.png` stands as the record of what was originally asked and is
  superseded on the card's internal arrangement. What the new one fixes, in the human's terms: the
  actions no longer interrupt the description (they are a footer), the id no longer floats on the
  most prominent line (it is anchored right), the uptime is no longer stranded among provenance (it
  is beside the state), and the image no longer shares a line with anything (it is a field of its
  own, front-truncating).
- **Read and act are two gestures.** The actions sit below a hairline on their own ground, so the
  five content bands read as one description and the footer as the place to act. No action stands
  between two bands of content.
- **The card's proportions are the mock's, taken from the library's own scale** (calibrated
  2026-08-25 against the running product). The card takes the library's **medium** inset, not its
  largest: at `lg` (32px) the inset was 8.4% of the card's own width against the mock's 4.9%, and
  with list-density controls in it the footer read as controls adrift in empty space. The footer's
  controls are at the library's **ordinary button size**, not a list row's `sm`: they close a card
  rather than end a row. Both are existing steps of the library's scale — the nearest ones — and no
  length was written for this card. Where the mock's own figures and the scale disagree the scale
  wins, and the residue is recorded rather than hidden: the mock's inset is 22px against the 20px
  step used, and its footer controls ~31px against the 36.8px the ordinary button size resolves to.
  Matching either exactly would mean a third button size or a spacing step that does not exist — a
  new value invented for one card, which is what the material rules refuse.
- **The detail control is a 24×24 box with the tighter radius of the scale**, decided by the human
  on 2026-08-25 against the mock's 26×26 at 8px. The measurement that decided it: the container's
  name is **23.2px** tall, so the control was already taller than the thing it stands beside, and
  the ordinary radius on a 24px box — 42% of its own side — read as a soft blob rather than as a
  quiet affordance. The box stays, because shrinking it would have bought a third icon-button size
  for a single call site; the rounding moved to an existing step, in the library and on the
  **size** rather than as a variant of this card (`icon-button.md`).
- **One rule maps state to presentation, and the dot, the pill and the accent always agree.** It is
  the module's one shared reading (`container-status.md`), which every state the product can display
  has an entry in — `created`, `restarting`, `removing` and `dead` included, not only the three the
  mock drew. The metric fills take that same tone. No card ever shows two states at once.
- **Which two ports are drawn is stable across polls**, because the order is: the list summary
  imposes a total order on a container's mappings (`containers-service.md`), the daemon's own order
  not being stable across reads. A card showing a subset of an unstably ordered set shows a
  *different* subset each poll, which reads as two chips swapping identity under a container that
  has not changed.
- **Ports are worded exactly as the delivered list worded them**, published and merely exposed
  alike: `publicPort→privatePort` where the port is published, the bare `privatePort` where it is
  only exposed. Both kinds, because no value the delivered row showed may disappear from the card
  (REQ-12); no chip is ever truncated or reworded.
- **The ports are read with the metrics, not with the image** (2026-08-25). The image says what the
  container is made of, the ports say how it is reached — operational information, of a kind with
  the figures beside it. The row's label anchors it, so a container with one port and one with four
  keep the same shape, and a container with none says `none` rather than dropping the row.
- **The detail control is live, and it is the only route into the detail.** It was shipped present
  and inert by the human's decision of 2026-08-25, with its click declared to arrive with the
  intervention that moved the container's detail onto the dialog surface; it has. It keeps the
  geometry, the position and the accessible name (`Open <name> details`) it was delivered with — the
  card's layout being out of that change's scope — and it is operable by keyboard as well as by
  pointer. It no longer swallows its own click, because there is no longer a card gesture to protect
  it from.
- **The card is not an interactive surface, and carries no expanded and no selected state in any
  form.** It asks the library for no selectable treatment, so it offers no hover and no selected
  highlight, and nothing on any card marks it as the one whose detail is open. Withdrawing the card
  body's click is a deliberate loss of the gesture operators had — the sole route in is now the
  corner control — and the cheap reversal, if it is ever asked for, is one call site.
- **At most two ports are drawn, the rest becoming one `+n` chip** (REQ-5, as reversed on
  2026-08-25). The split is at **three**, not two: a container reporting exactly three draws three
  chips, because one more chip costs precisely what the chip announcing it would and a `+1` is never
  worth drawing. **Two is a measurement**: the row is drawn on one line at the delivered track width
  (379px at a 1480px viewport), and the three-chip cap this shipped with put four chips on the row
  and wrapped it onto a second line — which is the anchored shape the ports were moved here for,
  lost. The full set stays one click away in the detail panel, so nothing is lost — only
  moved. This is a **deliberate reversal** of the earlier "every mapping, wrapping, none summarised"
  decision, which was taken for a card at full width; at a third of the page one container's port
  list set the height of every card beside it.
- The first slot is the **affirmative** control where the container is not running (`Start`,
  `Resume`) and a quiet one where it is (`Stop`). That is a weight, and only a weight: the action in
  the slot, its position and its legality are the caller's and are unchanged.
  - **`containers-refactor-b3.png` draws `Stop` accented, and on that point the mock is wrong**
    (established against the running product, 2026-08-25). The tone split above is a delivered
    decision read out of the original mock by the analysis: halting a running container is not the
    card's suggestion, while starting or resuming a stopped one is what the operator came for. The
    b3 mock is normative for **arrangement** — which band an element sits in, its order, its
    alignment — and not for this tone. Recorded here because the natural correction on seeing the
    two side by side is to change the code, which would reverse a decision nobody took.
- The card shows no age of any sample, and nothing on it is animated, transitioned or tweened
  between samples: a value that changes is redrawn where it stood.
- Block I/O and PIDS are deliberately absent; they stay in the detail panel.
- At 375×812 it carries the **same values** as at desktop width: the card is alone on its row, the
  metrics are stacked as they already are at every width, the footer's cluster wraps onto its own
  line keeping its order and its segmented geometry, and the port chips wrap. Nothing is hidden and
  nothing is scrolled sideways.
- This is one of exactly two feature files admitted by name to draw a surface per object
  (`check-ui-conformance.mjs`, 2026-08-25); its path is part of that admission and moving it fails
  the build.

## Dependencies

- ui-library: Card (with its footer, and without its selectable treatment), Stack, Row,
  StatusDotCell, SectionHeader, Badge, IdentifierCell, IconButton, Chip, FieldMessage,
  ActionButtonGroup (with its Menu), MetricStrip
- Container status reading (the state's tone)
- Containers client (`ContainerSummary`, `ContainerPort`)

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
- plan-docker_management_app-containers_card_view-detail_modal/REQ-5
- plan-docker_management_app-containers_card_view-detail_modal/REQ-6
- plan-docker_management_app-containers_card_view-detail_modal/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal/REQ-8
- plan-docker_management_app-containers_card_view-detail_modal/REQ-9
- plan-docker_management_app-containers_card_view-detail_modal/REQ-30
