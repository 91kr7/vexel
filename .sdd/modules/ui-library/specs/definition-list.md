---
module: ui-library
component: DefinitionList
type: UI component
---

# DefinitionList

**Purpose** → label → value rows for a detail surface (e.g. a container's identity, restart policy,
environment variables), each with an optional copy affordance.

## Contract

- `<DefinitionList items columns? />`
  - `items: { label, value: ReactNode, copyValue?: string }[]`.
  - `columns?: 1 | 2` — single column (default) or a two-column grid of rows.
  - When `copyValue` is set on an item, its row renders a `CopyButton` for that exact text next to
    `value`.

## Dependencies

- CopyButton

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-26
