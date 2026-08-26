---
module: ui-library
component: LogStream
type: UI component
---

# LogStream

**Purpose** → the surface that displays a long, growing stream of monospace log lines: virtualised
rendering, follow/auto-scroll with a "jump to live" affordance, an optional timestamp column,
per-line stream tagging, per-line level distinction, match highlighting, and download of the
displayed buffer.

## Contract

Description:

- a dark, sunken monospace region with an actions row above it (the caller's own stream controls at
  the start and the download action at the end, when either is offered — or, when the caller asks to
  compose the row itself, whatever arrangement of its own controls and the download it returns; the
  row is not drawn at all when neither is offered) and, when
  follow is off, a floating "Jump to live" control over the bottom of the region, through whose
  frame the lines it sits over show blurred.

Props:

- `<LogStream lines showTimestamps? follow? onFollowChange? highlight? activeMatchLineId? maxHeight? fill? lineHeight? emptyLabel? downloadFileName? toolbar? />`
  - `lines: { id, text, timestamp?, stream?, source?, level? }[]` — `timestamp` is display-ready
    text supplied by the caller; `stream` is `'stdout' | 'stderr'`; `source?` is an origin label
    (e.g. a compose service name) shown before the timestamp, for an aggregated stream; `level?` is
    `'error' | 'warn'`, the severity the **caller** has established for that line.
  - `showTimestamps?: boolean` (default `false`).
  - `follow?: boolean` (default `true`), `onFollowChange?: (follow: boolean) => void`.
  - `highlight?: string` — case-insensitive substring highlighted in every line that contains it.
  - `activeMatchLineId?: string` — the line to bring into view and emphasize as the current match.
  - `maxHeight?: string` (default `"320px"`), `lineHeight?: number` in px (default `20`).
  - `fill?: boolean` (default `false`) — the region's bound comes from the region the stream is
    placed in instead of `maxHeight`, and follows it as it follows the screen. A caller that does not
    ask for it keeps the `maxHeight` behaviour exactly.
  - `emptyLabel?: string` — title shown when `lines` is empty (default `"No log output."`).
  - `downloadFileName?: string` — when given, the action row above the region holds a download action
    producing a plain-text file with that name.
  - `toolbar?: ReactNode | (download => ReactNode)` — controls belonging to the stream (a search
    box, filters) placed on that **same** action row. Two forms, and the caller picks which:
    - **given as content** — the controls are placed before the download action and take the width
      it does not; they wrap among themselves at a width that cannot carry them, and the download
      action stays at the row's end.
    - **given as a composer** — it is called with the download action (or `null` when no
      `downloadFileName` is given) and returns the row's whole content, so the caller may present
      its controls as groups of its own **with the download among them** instead of fixed at the
      row's end. Nothing is added at the row's end in this form: what the composer returns is the
      row, and its content is spread across the row's width, so two groups fall at its two ends.
    Either way the row is one row, laid out along its width, and its content wraps within it — a
    stream's controls and its download never take a row each.
  - the action row is rendered only when it has something to hold: with neither `toolbar` nor
    `downloadFileName` it is not drawn at all, so it consumes no height and no gap.

Shows:

- one row per line, in the given order; a leading source label when the line carries a `source`,
  then a timestamp column only when `showTimestamps` is true and the line carries a `timestamp`.
- lines tagged `stderr` are visually distinguished from `stdout` ones, and lines carrying a `level`
  are distinguished by it. The two distinctions are carried on **different channels** and are
  therefore readable at once: the level colours the line's text, the stream marks the line's leading
  edge. A line that is both an `stderr` line and an `error` line shows both, and neither replaces the
  other.
- a line carrying no `level` is drawn in the region's ordinary treatment. The component deduces
  nothing from a line's text: the level is the caller's reading, never this component's.
- only the lines in and around the visible window are mounted; the scrollbar still reflects the
  full line count.
- every occurrence of `highlight` inside a line's text is marked; the line whose id is
  `activeMatchLineId` is emphasized as the current match.
- an empty-state title instead of the region when `lines` is empty.

Actions:

- "Download" (only when `downloadFileName` is given) → saves the full text of `lines` as a
  plain-text file named `downloadFileName`, one line per row, each prefixed with its `source` when
  present and its timestamp only when `showTimestamps` is true.
  - It is the **only** way to take the buffer off this surface. A copy action stood beside it until
    2026-08-14, when `plan-docker_management_app-remove_copy_controls` removed it; the region is
    virtualised, so a hand-selection captures the rendered window and never the buffer.
- "Jump to live" (only shown when `follow` is false) → calls `onFollowChange(true)`.

## Rules and invariants

- The action row exists so that a stream's controls and its download share **one** row rather than
  taking one each (`plan-ui-coherence-optimisation/REQ-62`): a row holding the download action alone
  is what the delivered container logs surface drew as its third stacked row. The composer form
  **refines** that rule and does not lift it — it moves the download in among the caller's own
  groups, on the same one row; it does not let a caller add a second.
- **The line's own text is rendered exactly as it was given**, whatever distinction is applied to it:
  complete, in order, unaltered, selectable, and with every occurrence of `highlight` still marked
  over the distinction. No level, stream or match treatment adds, removes or rewrites a character of
  it, and none of them is a prefix, a badge or a marker inserted into the text.
- What `toolbar` holds — and which of its two forms is used — changes nothing about the region: the
  same lines are mounted, the same buffer is downloaded, and the slot's content is rendered where it
  is placed rather than re-mounting the stream. The download action is the same action in both forms,
  saving the same buffer under the same name.
- **`fill` changes where the bound comes from and nothing else.** Virtualisation, the follow
  behaviour, the jump-to-live control, the match highlighting and the download are identical in both
  modes: the scrollport is still what the window is measured against, so only its source differs — a
  stated maximum, or the region, observed as it changes so that a screen made taller mounts the lines
  it has just made room for. Nothing about which lines are streamed, buffered, rendered or downloaded
  follows from it.
- Under `fill` the region is still bounded, never content-driven: a caller may only ask for it inside
  a region whose own height is bounded.
- While `follow` is true, the region stays scrolled to the last line as new lines arrive.
- Scrolling away from the bottom by hand calls `onFollowChange(false)`; scrolling back to the
  bottom by hand calls `onFollowChange(true)`.
- A change of `activeMatchLineId` scrolls that line into view without changing `follow`.
- No animation and no blur is applied to **the region**, its lines, their level or stream
  distinction, their match highlighting or their scroller (large, frequently repainted surface).
  A distinction is a colour and an edge, never a transition into one.
- The floating "Jump to live" control is the one exception, and the only blurred thing here: it
  carries the overlay glass material (see `overlay-glass.md`), so the lines under it are rendered
  blurred, and it takes that material's fill, border, no-backdrop-blur fallback and
  reduced-transparency variant with it (plan-liquid_glass_overlays/REQ-17). Its own label stays
  sharp.
- There is **one** such control per log stream, and only while `follow` is false. It is the most
  expensive surface allowed to blur in the application — small, but sitting over a view that
  repaints on every arriving line and every scrolled frame — a knowingly accepted risk against
  `plan-docker_management_app/REQ-109` (recorded in `plan-liquid_glass_overlays/requirements.md`)
  and **the first thing withdrawn if scrolling regresses on a real machine**.
- What the control blurs is a sibling inside the region rather than the page behind an overlay
  layer, so the control is a stacking context of its own: without one, the material's blur layer
  would be painted underneath the lines and would blur what is behind the log region instead of the
  lines. It is a stacking context and not a backdrop root, so the material's nesting invariant is
  untouched.

## Dependencies

- ScrollArea, Button, EmptyState, Row, Overlay glass material

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
- plan-liquid_glass_overlays/REQ-17
- plan-ui-coherence-optimisation/REQ-62
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-3
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-27
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-29
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-30
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-31
