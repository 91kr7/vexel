---
module: ui-library
component: PrivilegeList
type: UI component
---

# PrivilegeList

**Purpose** → the permissions an operation asks for, one per row, so each of them can be read before
it is granted. The review surface a granting decision is taken on — typically inside a confirmation
dialog.

## Contract

- `<PrivilegeList items emptyLabel? />`
  - `items: { name, description?, values }[]` — `name` is what is being asked for (e.g. "network"),
    `description` one line on what granting it allows, `values: string[]` the exact value(s) asked
    for.
  - Each row shows the name, the values in monospace, and the description below when there is one.
  - Several values are shown together, separated by commas, in the order given.
  - A row whose values are empty — or nothing but empty strings — shows `—` rather than a blank:
    a privilege asked for with no value is still asked for.
  - `emptyLabel?: string` — shown in place of the rows when `items` is empty; defaults to
    "Nothing is being asked for."

## Rules and invariants

- Presentation only: it neither grants nor refuses, holds no selection and offers no control. The
  decision belongs to the surface that hosts it.
- Nothing is summarised, truncated or omitted: every privilege given is rendered, so what is granted
  is what was read.

## Requirements served

- plan-docker_management_app/REQ-99
- plan-docker_management_app/REQ-111
