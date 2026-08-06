---
module: ui-library
component: UI library entry point
type: module entry
---

# UI library entry point

**Purpose** → the single import path (`client/src/ui/index.ts`, imported as `../ui` or `../../ui`)
feature code uses to reach every UI-library component; nothing under `client/src/ui/` is imported
by its own file path from outside the library.

## Contract

- Re-exports every component and its public prop types listed in this module's index.

## Rules and invariants

- Feature code never imports a path under `client/src/ui/*` other than `client/src/ui/index.ts`
  (REQ-5).

## Requirements served

- plan-docker_management_app/REQ-5
