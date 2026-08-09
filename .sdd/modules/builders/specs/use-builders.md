---
module: builders
component: useBuilders
type: frontend hook
---

# useBuilders

**Purpose** → reads the buildx builder list and drives create/remove/select-active.

## Contract

- `useBuilders(): { builders, loaded, error?, refresh, create, remove, use }`
  - `builders: BuilderSummary[]`, re-read on a bounded poll and via `refresh()`.
  - `create(input): Promise<BuilderSummary>`, `remove(name): Promise<void>`,
    `use(name): Promise<BuilderSummary>` — each re-reads the builder list on success; failures
    propagate to the caller (never swallowed) so the screen can report them.

## Rules and invariants

- Re-reads from scratch when another context becomes the active one: the list belonged to the
  daemon left behind (REQ-93).

## Dependencies

- builders: Builders client
- contexts: Active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-93
