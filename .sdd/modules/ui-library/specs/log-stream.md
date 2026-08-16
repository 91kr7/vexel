---
module: ui-library
component: LogStream
type: UI component
---

# LogStream

**Purpose** → the surface that displays a long, growing stream of monospace log lines: virtualised
rendering, follow/auto-scroll with a "jump to live" affordance, an optional timestamp column,
per-line stream tagging, match highlighting, and download of the displayed buffer.

## Contract

Description:

- a dark, sunken monospace region with an actions row above it (the caller's own stream controls at
  the start and the download action at the end, when either is offered — the row is not drawn at all
  when neither is) and, when
  follow is off, a floating "Jump to live" control over the bottom of the region, through whose
  frame the lines it sits over show blurred.

Props:

- `<LogStream lines showTimestamps? follow? onFollowChange? highlight? activeMatchLineId? maxHeight? lineHeight? emptyLabel? downloadFileName? toolbar? />`
  - `lines: { id, text, timestamp?, stream?, source? }[]` — `timestamp` is display-ready text
    supplied by the caller; `stream` is `'stdout' | 'stderr'`; `source?` is an origin label (e.g. a
    compose service name) shown before the timestamp, for an aggregated stream.
  - `showTimestamps?: boolean` (default `false`).
  - `follow?: boolean` (default `true`), `onFollowChange?: (follow: boolean) => void`.
  - `highlight?: string` — case-insensitive substring highlighted in every line that contains it.
  - `activeMatchLineId?: string` — the line to bring into view and emphasize as the current match.
  - `maxHeight?: string` (default `"320px"`), `lineHeight?: number` in px (default `20`).
  - `emptyLabel?: string` — title shown when `lines` is empty (default `"No log output."`).
  - `downloadFileName?: string` — when given, the action row above the region holds a download action
    producing a plain-text file with that name.
  - `toolbar?: ReactNode` — controls belonging to the stream (a search box, filters) placed on that
    **same** action row, before the download action, taking the width the download action does not.
    They wrap among themselves at a width that cannot carry them; the download action stays at the
    row's end.
  - the action row is rendered only when it has something to hold: with neither `toolbar` nor
    `downloadFileName` it is not drawn at all, so it consumes no height and no gap.

Shows:

- one row per line, in the given order; a leading source label when the line carries a `source`,
  then a timestamp column only when `showTimestamps` is true and the line carries a `timestamp`.
- lines tagged `stderr` are visually distinguished from `stdout` ones.
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
  is what the delivered container logs surface drew as its third stacked row.
- What `toolbar` holds changes nothing about the region: the same lines are mounted, the same buffer
  is downloaded, and the slot's content is rendered where it is placed rather than re-mounting the
  stream.
- While `follow` is true, the region stays scrolled to the last line as new lines arrive.
- Scrolling away from the bottom by hand calls `onFollowChange(false)`; scrolling back to the
  bottom by hand calls `onFollowChange(true)`.
- A change of `activeMatchLineId` scrolls that line into view without changing `follow`.
- No animation and no blur is applied to **the region**, its lines, their match highlighting or
  their scroller (large, frequently repainted surface).
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
