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

- Re-exports every component of this module's index that feature code composes, with its public prop
  types.

## Rules and invariants

- Feature code never imports a path under `client/src/ui/*` other than `client/src/ui/index.ts`
  (REQ-5).
- A behaviour used only *between* library components is deliberately **not** re-exported, so the
  public surface stays what feature code can compose: the escape arbitration
  (`escape-arbitration.md`) is indexed and specified, and reached only from inside the library. It is
  exported from here the day a feature needs it, not before.
- A component is exported from here before any feature code composes it — including `Menu` and its
  `MenuEntry` type, which the containers row reaches through this path alone.

## Requirements served

- plan-docker_management_app/REQ-5
- plan-docker_management_app-container_row_actions/REQ-17
