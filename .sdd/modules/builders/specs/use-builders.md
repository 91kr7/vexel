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

## Dependencies

- builders: Builders client

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
