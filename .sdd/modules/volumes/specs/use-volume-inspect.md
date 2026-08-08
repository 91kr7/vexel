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
  - Reads when `name` changes (to a defined value) and on every `volume` or `container` daemon
    event.
  - Returns an empty, not-loaded result while `name` is `undefined` (no volume selected).

## Requirements served

- plan-docker_management_app/REQ-71
