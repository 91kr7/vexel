---
module: ui-library
component: ConsoleSurface
type: UI component
---

# ConsoleSurface

**Purpose** → the transcript of a command console: past entries, each with the command as it was
typed, its output and how it ended, and — on the same surface — the prompt that adds the next one.

Not a `LogStream`: that surface is one continuous tail of a single stream, where this one is a
sequence of self-contained entries (own command, own status, own re-run) followed by an
editable prompt line, and it wraps long lines instead of clipping them (a raw API body is one very
long line).

## Contract

Description:

- a dark, sunken monospace region holding the entries, with the prompt line pinned under it inside
  the same bordered surface.

Props:

- `<ConsoleSurface entries value onChange onSubmit promptSymbol? placeholder? inputAriaLabel?
  recallable? busy? onCancel? onRerun? maxHeight? emptyLabel? />`
  - `entries: { id, command, channelLabel?, lines, status?, statusTone?, running?, note? }[]`
    - `lines: { id, text, stream? }[]` — `stream` is `'stdout' | 'stderr'`.
    - `status` is the caller's own wording (e.g. `exit 0`, `HTTP 404`); `statusTone` is a badge tone.
    - `note?` — a muted aside next to the status (e.g. why the entry was not kept).
  - `value` / `onChange` / `onSubmit` — the prompt's text and its submission.
  - `promptSymbol?` (default `"$"`), `placeholder?`, `inputAriaLabel?` (default `"Console prompt"`).
  - `recallable?: string[]` — earlier commands, oldest first.
  - `busy?: boolean` (default `false`), `onCancel?` — a cancel control appears only when both are set.
  - `onRerun?: (entryId) => void` — when set, every entry offers a "Re-run" control.
  - `maxHeight?: string` (default `"420px"`), `emptyLabel?: string`.

Shows:

- one block per entry, in the given order: the prompt symbol and the command exactly as given, its
  channel label when present, then its status — a pending indicator while `running` is true, the
  status badge once it is not — and its note when present.
- the entry's output lines under it, in order, wrapped rather than clipped, and wrapped at the
  payload's own token boundaries rather than wherever the edge of the box falls (see
  `payload-wrapping.md`): a raw daemon body is one line with no spaces in it, and it must stay
  inside the surface without a value being cut in half. A line tagged `stderr` is visually
  distinguished from an `stdout` one.
- the empty-state label instead of any entry when `entries` is empty.
- the prompt line: the prompt symbol, the editable value, the placeholder while it is empty.

Actions:

- "Re-run" (on every entry, only when `onRerun` is set) → calls `onRerun(entry.id)`; inert while
  `busy`.
- "Cancel" (only while `busy` and `onCancel` is set) → calls `onCancel`.
- typing in the prompt → calls `onChange` with the new value.
- `Enter` in the prompt → calls `onSubmit`; does nothing when `busy` or when the value is blank.
- `ArrowUp` / `ArrowDown` in the prompt → walks `recallable` into the prompt, most recent first;
  walking back past the most recent one restores the text the operator had typed.

## Rules and invariants

- The region stays scrolled to the last entry as entries and their lines arrive.
- An output line is shown in full: never clamped, never ellipsised, never held in a region that has
  to be scrolled sideways to be read. It is the daemon's own text, complete and selectable, however
  long it is.
- A command is displayed exactly as it was given: the surface never rewrites, trims or re-quotes it.
- Editing the prompt by hand ends the recall walk, so the next `ArrowUp` starts again from the most
  recent command and the operator's own text is what a walk back down restores.
- No animation and no blur is applied to the region (large, frequently repainted surface).

## Dependencies

- ScrollArea, Badge, Button, Spinner, Payload wrapping

## Requirements served

- plan-ui-coherence-optimisation/REQ-76
- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-102
- plan-docker_management_app/REQ-104
