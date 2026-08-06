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

## Dependencies

- TextField, Button

## Requirements served

- plan-docker_management_app/REQ-31
