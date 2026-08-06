---
module: ui-library
component: TimeRangeField
type: UI component
---

# TimeRangeField

**Purpose** → a since/until pair of inputs bounding a stream in time.

## Contract

- `<TimeRangeField since until onChange sinceLabel? untilLabel? placeholder? message? />`
  - `since: string`, `until: string` — free-text bounds, empty meaning unbounded.
  - `onChange({ since, until }): void` — called on every edit of either input, with both values.
  - `sinceLabel?: string` (default `"Since"`), `untilLabel?: string` (default `"Until"`).
  - `placeholder?: string` — shown in both inputs when empty.
  - `message?: string` — an optional helper/validation message shown below the inputs.

Shows:

- two labelled single-line inputs side by side.

## Dependencies

- TextField, FieldMessage

## Requirements served

- plan-docker_management_app/REQ-30
