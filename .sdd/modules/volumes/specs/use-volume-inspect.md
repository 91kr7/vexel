---
module: volumes
component: useVolumeInspect
type: frontend hook
---

# useVolumeInspect

**Purpose** → reads a single volume's inspect data, re-reading on selection change and whenever a
related daemon event arrives.

## Contract

- `useVolumeInspect(name: string | undefined): { inspect?: VolumeInspect, loaded: boolean, error?:
  string, refresh: () => void }`
  - Reads when `name` changes (to a defined value), on a `volume` event about that same volume, and
    on every `container` event.
  - Returns an empty, not-loaded result while `name` is `undefined` (no volume selected).

## Rules and invariants

- A `volume` event about another volume is ignored: the daemon is not asked about the shown volume
  (plan-docker_management_app-refresh_cache/REQ-7). The event is attributed by its `actorId`, which
  for a volume is its name; one carrying none is treated as about the shown volume, so no change is
  ever missed (plan-docker_management_app-refresh_cache/REQ-8).
- Every `container` event still re-reads, whichever container it is about: the containers mounting
  the volume are part of what the view shows, and a container event can change that list.

## Dependencies

- Volumes client (fetchVolumeInspect)
- events: subscribeToDaemonEvents, daemonEventConcerns

## Requirements served

- plan-docker_management_app/REQ-71
- plan-docker_management_app-refresh_cache/REQ-7
- plan-docker_management_app-refresh_cache/REQ-8
