---
module: ui-library
component: ResultSummary
type: UI component
---

# ResultSummary

**Purpose** → reports what an action just did: a headline figure over one line per part of the
work, kept on screen after the action rather than passing by like a toast.

## Contract

- `<ResultSummary title headline items? tone? />`
  - `title` — small eyebrow label of the block (e.g. "Last prune").
  - `headline` — the outcome's figure, prominent (e.g. "1.2GB reclaimed").
  - `items?: { label, value, failed? }[]` — one line each; `failed` marks the line as the failed
    part of an otherwise successful outcome.
  - `tone?: 'neutral' | 'success' | 'danger'` (default `'neutral'`).

Shows:

- the title and the headline on one line, then the item lines, each as `label` → `value`; no lines
  when `items` is empty or absent.

## Rules and invariants

- It reports, it does not act: the block carries no control of its own.
- It never reports a failure of the whole action — ErrorBanner covers that; it reports a completed
  action, whose parts may individually have failed.

## Requirements served

- plan-docker_management_app/REQ-96
