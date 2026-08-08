---
module: compose
component: useComposeProjects
type: frontend hook
---

# useComposeProjects

**Purpose** → reads the compose project list, kept fresh without a manual refresh.

## Contract

- `useComposeProjects(): { projects, loaded, error?, refresh }`
  - Reads on mount, on a bounded poll, and on every `container` daemon event (a compose project is
    made of containers).
  - `refresh()` re-reads on demand (e.g. right after a lifecycle action).

## Dependencies

- compose: Compose client (`fetchComposeProjects`)
- events: daemon event subscription

## Requirements served

- plan-docker_management_app/REQ-75
