---
module: containers
component: useContainerProcesses
type: frontend hook
---

# useContainerProcesses

**Purpose** → reads the processes running inside a container once, and again only when the operator
asks for it.

## Contract

- `useContainerProcesses(id?: string):
  { processes: ContainerProcess[], titles: string[], loaded: boolean, loading: boolean,
    error?: string, refresh: () => void }`
  - `loaded` — true once a first attempt has completed for the current `id`, successful or not.
  - `loading` — true while a read is in flight (including the first one).
  - `error` — the failure's message; cleared by a successful read.
  - `refresh()` — re-reads the listing for the current `id`; a no-op when `id` is `undefined`.

## Rules and invariants

- The listing is read once when `id` becomes defined or changes, and otherwise only through
  `refresh()`: it is never polled and does not react to daemon events (REQ-33 asks for an explicit,
  on-demand refresh).
- Changing `id` empties the previous container's listing before the new read.
- A failed read leaves `processes` empty and reports the message rather than keeping stale rows.
- Results arriving after the caller unmounted are discarded.

## Dependencies

- Container stats client (fetchContainerProcesses, ContainerProcess)

## Requirements served

- plan-docker_management_app/REQ-33
