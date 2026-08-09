---
module: registries
component: useRegistries
type: frontend hook
---

# useRegistries

**Purpose** → reads the configured registries and drives log in / log out (REQ-85, REQ-87).

## Contract

- `useRegistries(): { registries, loaded, error?, refresh, logIn, logOut }`
  - `registries: RegistrySummary[]` — empty until the first read settles, and after a failed one.
  - `loaded` — true once the first read has settled, whether it succeeded or not.
  - `error?` — the message of the last failed read; cleared by the next successful one.
  - `refresh()` — re-reads the inventory.
  - `logIn({ host, username, secret }): Promise<RegistrySummary>` — logs in, then re-reads the
    inventory; rejects with the server's message.
  - `logOut(host): Promise<RegistrySummary>` — logs out, then re-reads the inventory.

## Rules and invariants

- **The hook holds no credential state of any kind** (REQ-87): the secret passed to `logIn` is
  forwarded to the server and kept nowhere — not in state, not in a ref, not in a cache.
- An answer that is not a list is treated as a failed read: it is reported, never stored, so no
  consumer is ever handed a non-list.
- The inventory is re-read on a bounded poll — a slow one, because it changes only when somebody
  edits the local Docker configuration or the credential store (e.g. a `docker login` run from a
  terminal).
- It re-reads on the active-context broadcast: another context can mean another daemon, and with it
  another view of which registries are insecure (REQ-93).
- A read that settles after the hook unmounts updates nothing.

## Dependencies

- registries: Registries client
- contexts: Active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-87
