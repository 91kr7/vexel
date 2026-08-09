---
module: contexts
component: useContexts
type: frontend hook
---

# useContexts

**Purpose** → reads the Docker context inventory and drives create/remove/select-active.

## Contract

- `useContexts(): { contexts, active?, loaded, error?, refresh, create, remove, use }`
  - `contexts: ContextSummary[]`, re-read on a bounded poll and via `refresh()`.
  - `active` is the context marked active in the inventory; `undefined` until the list has been read
    or when none is.
  - `create(input): Promise<ContextSummary>`, `remove(name): Promise<void>`,
    `use(name): Promise<ContextSummary>` — each re-reads the inventory on success; failures propagate
    to the caller (never swallowed) so the screen can report them.
  - `use(name)` announces the switch on the active-context broadcast, once the server confirms it —
    never before, and never on failure.

## Rules and invariants

- The re-read after a change reaches **every mounted instance of the hook**, not only the one that
  acted: the Contexts screen and the shell always name the same active context and count the same
  contexts, with no interval of disagreement between them.
- A switch is followed by subscribing to the active-context broadcast, not by the local state of the
  instance that made it: whoever announces a switch, every instance re-reads.
- An answer that is not a list of contexts is treated exactly like a failed read — reported through
  `error`, never stored — so no consumer is ever handed something it cannot iterate.
- The poll is deliberately slower than a daemon-object one (contexts change only when the local
  Docker configuration is edited): it exists to notice a `docker context` command run from a
  terminal, not to track live state.

## Dependencies

- contexts: Contexts client, Active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
