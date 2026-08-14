---
module: ui-library
component: StreamSearchField
type: UI component
---

# StreamSearchField

**Purpose** → the in-surface search box of a stream: a search term plus the match count and
next/previous navigation between matches.

## Contract

- `<StreamSearchField value onChange matchCount activeMatchIndex onNext onPrevious placeholder? />`
  - `value: string`, `onChange(value): void`.
  - `matchCount: number` — total matches found by the caller.
  - `activeMatchIndex: number` — zero-based index of the current match; ignored when
    `matchCount` is 0.
  - `onNext(): void`, `onPrevious(): void`.
  - `placeholder?: string` (default `"Filter…"`).

Shows:

- the search input, and to its right the match indicator: nothing when `value` is empty,
  `"No matches"` when `matchCount` is 0, otherwise `"<activeMatchIndex + 1>/<matchCount>"`.
- previous/next controls, disabled while `matchCount` is 0.

Actions:

- typing → `onChange` with the new value.
- "Next"/"Previous" → `onNext()` / `onPrevious()`.
- pressing Enter in the input → `onNext()`.

## Rules and invariants

- **The band is the size of the controls it holds, on whichever axis it is placed**, and it claims no
  height nothing is drawn in. Placed in a column it is the height of its control and the full width
  of the column; placed in a row it keeps a floor of 240px and grows to fill the row.
- **The axis is decided here, by the axis the band was actually placed on, and never by the caller.**
  There is no axis prop, deliberately: a prop asking a screen which axis it is on is the defect this
  rule exists to prevent, written down. The row-axis rule is scoped to the library's own row
  primitive, so the column case needs no cooperation from any call site.
- Why it is stated this way: the band used to declare `flex: 1 1 240px` unconditionally — a rule
  written for a row, which reads as *240px tall* the moment the band is stacked in a column. On the
  image filesystem browser that drew a 37px control in the middle of a 240px band, with 103px of
  nothing above and below it, twice over. `flex-grow` on the block axis is worse still: it turns a
  240px void into a "takes everything left" one, so it must not survive there.

## Dependencies

- TextField, Button

## Requirements served

- plan-docker_management_app/REQ-31
- plan-docker_management_app-filesystem_browser_layout/REQ-3
- plan-docker_management_app-filesystem_browser_layout/REQ-4
