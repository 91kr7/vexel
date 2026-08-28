---
module: registries
component: useRegistryRepositories
type: frontend hook
---

# useRegistryRepositories

**Purpose** → browses a registry's repositories for a search term, then each repository's tags with
the size they weigh (REQ-86).

## Contract

- `useRegistryRepositories(host | undefined, query): { entries, loaded, searching, error?, refresh }`
  - `entries: { repository, tags, tagsLoading, tagsError? }[]` — one per repository found, in the
    order the registry returned them; `tags` fills in as each repository's tag listing arrives.
  - `loaded` — true once a search has settled for the current registry and term.
  - `searching` — true while a search is in flight, including during its debounce.
  - `error?` — the message of the failed repository search; the entries are emptied with it.
  - `refresh()` — runs the search again.
  - Passing no host keeps the browser closed: no request is made, the entries are empty and
    `loaded` is false.

## Rules and invariants

- A search runs on the term the operator stopped typing, not on every keystroke: a change to the
  host or the term restarts a short debounce, and only the last one reaches the server.
- Tags are read one repository at a time, and a repository whose tags fail keeps its row with the
  failure recorded against it — the other repositories are unaffected.
- A search or tag listing that settles after the host or term changed, or after the hook unmounts,
  updates nothing.
- It re-runs on the active-context broadcast: another context can mean another daemon and another
  view of which registries are reachable and how (REQ-93).
- Results are what an anonymous client can reach: no credential is read back to widen them
  (REQ-87).
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- registries: Registries client
- contexts: Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-86
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
