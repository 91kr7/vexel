---
module: ui-library
component: StepProgressList
type: UI component
---

# StepProgressList

**Purpose** → shows a multi-step operation (e.g. an image pull/push's per-layer transfer) as one
row per unit of work, each with its own progress and terminal state.

## Contract

- `<StepProgressList steps />`
  - `steps: ProgressStep[]` — `{ id, label, detail?, status: 'pending' | 'active' | 'done' |
    'error', percent? }`.
  - Each row shows `label`, a status badge (`Pending` / `In progress` / `Done` / `Failed`, toned
    neutral/neutral/success/danger), `detail` when given, and a `ProgressBar` while `status` is
    `pending` or `active` (`percent` when known, indeterminate otherwise).

## Rules and invariants

- A `done` or `error` step never shows a progress bar: only `pending`/`active` steps do.
- Rows render in the order given in `steps`; the caller owns ordering and de-duplication by `id`.

## Dependencies

- Badge, ProgressBar

## Requirements served

- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
