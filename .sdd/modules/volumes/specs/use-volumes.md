---
module: volumes
component: useVolumes
type: frontend hook
---

# useVolumes

**Purpose** → reads the volume list, re-reading on a bounded poll and whenever a related daemon
event arrives.

## Contract

- `useVolumes(): { volumes: VolumeSummary[], loaded: boolean, error?: string, refresh: () => void }`
  - Reads on mount, on a 3-second poll, and on every `volume` or `container` daemon event (a
    container's own mounts changing which volumes it mounts affects the volume list's `mountedBy`)
    (REQ-70).
  - `refresh()` re-reads on demand; `loaded` becomes `true` once the first read settles (success or
    failure); `error` carries the last failure's message.

## Requirements served

- plan-docker_management_app/REQ-70
