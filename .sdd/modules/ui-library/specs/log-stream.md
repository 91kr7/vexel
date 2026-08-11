---
module: ui-library
component: LogStream
type: UI component
---

# LogStream

**Purpose** → the surface that displays a long, growing stream of monospace log lines: virtualised
rendering, follow/auto-scroll with a "jump to live" affordance, an optional timestamp column,
per-line stream tagging, match highlighting, and copy/download of the displayed buffer.

## Contract

Description:

- a dark, sunken monospace region with an actions row above it (copy, optional download) and, when
  follow is off, a floating "Jump to live" control over the bottom of the region, through whose
  frame the lines it sits over show blurred.

Props:

- `<LogStream lines showTimestamps? follow? onFollowChange? highlight? activeMatchLineId? maxHeight? lineHeight? emptyLabel? downloadFileName? />`
  - `lines: { id, text, timestamp?, stream?, source? }[]` — `timestamp` is display-ready text
    supplied by the caller; `stream` is `'stdout' | 'stderr'`; `source?` is an origin label (e.g. a
    compose service name) shown before the timestamp, for an aggregated stream.
  - `showTimestamps?: boolean` (default `false`).
  - `follow?: boolean` (default `true`), `onFollowChange?: (follow: boolean) => void`.
  - `highlight?: string` — case-insensitive substring highlighted in every line that contains it.
  - `activeMatchLineId?: string` — the line to bring into view and emphasize as the current match.
  - `maxHeight?: string` (default `"320px"`), `lineHeight?: number` in px (default `20`).
  - `emptyLabel?: string` — title shown when `lines` is empty (default `"No log output."`).
  - `downloadFileName?: string` — when given, a download action producing a plain-text file with
    that name appears next to the copy action.

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

- "Copy" → puts the full text of `lines` on the clipboard, one line per row, each prefixed with its
  `source` when present and its timestamp only when `showTimestamps` is true.
- "Download" (only when `downloadFileName` is given) → saves that same text as a plain-text file
  named `downloadFileName`.
- "Jump to live" (only shown when `follow` is false) → calls `onFollowChange(true)`.

## Rules and invariants

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

- ScrollArea, CopyButton, Button, EmptyState, Overlay glass material

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
- plan-liquid_glass_overlays/REQ-17
