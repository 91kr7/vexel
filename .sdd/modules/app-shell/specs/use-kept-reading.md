---
module: app-shell
component: useKeptReading
type: frontend hook
---

# useKeptReading

**Purpose** → holds one reading and decides what the next one does to it: a reading that serialises
like the one in hand replaces nothing, so nothing downstream is redrawn.

## Contract

- `useKeptReading<T>(initial: T): [T, (arrived: T) => void]`
  - the first element is the reading in hand — `initial` until an arrival replaces it.
  - the second element, `keep(arrived)`:
    - `arrived` serialises like the reading in hand → the reading in hand stays, identity included,
      and the caller re-renders nothing.
    - `arrived` serialises differently → it becomes the reading in hand.
  - `keep` keeps one identity for the caller's whole life, so it can be the dependency of a callback
    or an effect without changing it.

## Rules and invariants

- **One serialisation per call, of the reading that arrived**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-49). The serialisation
  of what is in hand was computed by the call that stored it and is kept beside it, so no later call
  computes it again: a tick that changes nothing costs the serialisation of what arrived, and
  nothing else.
- Equality is the serialisation, so two readings of the same content are equal whatever their
  identity — which is what a freshly parsed answer always is
  (…-client_event_refresh_removal/REQ-47).
- A reading that differs replaces the one in hand at once: nothing is delayed, coalesced or skipped,
  and no order is imposed on two arrivals (…-client_event_refresh_removal/REQ-48, REQ-52).
- `initial` is serialised once, when the caller mounts, so a first arrival equal to it is kept too.
- `keep` is the only way in: emptying or clearing is a call like any other — `keep([])`,
  `keep(undefined)` — and keeps the identity in hand when that is already what is held.
- A reading that cannot be serialised is outside the contract: what the callers store is what a JSON
  answer parsed to.

## Dependencies

- none

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-47
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-49
