---
module: ui-library
component: TailSizeSelector
type: UI component
---

# TailSizeSelector

**Purpose** → picks how many trailing lines of a stream to load: a small set of sizes plus an
"all" choice.

## Contract

- `<TailSizeSelector value onChange options? ariaLabel? />`
  - `value: number | 'all'` — the current tail size.
  - `onChange(value: number | 'all'): void`.
  - `options?: number[]` — the offered sizes (default `[100, 500, 1000, 5000]`); an "All" choice is
    always offered in addition.
  - `ariaLabel?: string` (default `"Tail size"`).

Shows:

- a labelled single-choice control listing each size as `"last <n> lines"` plus `"All"`.

Actions:

- picking a size → `onChange` with that number; picking "All" → `onChange('all')`.

## Dependencies

- Select

## Requirements served

- plan-docker_management_app/REQ-30
