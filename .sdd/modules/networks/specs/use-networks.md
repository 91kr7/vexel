---
module: networks
component: useNetworks
type: frontend hook
---

# useNetworks

**Purpose** → reads the network list, re-reading on a bounded poll and whenever a related daemon
event arrives.

## Contract

- `useNetworks(): { networks: NetworkSummary[], loaded: boolean, error?: string, refresh: () => void
  }`
  - Reads on mount, on a 3-second poll, and on every `network` or `container` daemon event (a
    container's own attachments changing which networks list it) (REQ-72).
  - `refresh()` re-reads on demand; `loaded` becomes `true` once the first read settles (success or
    failure); `error` carries the last failure's message.

## Requirements served

- plan-docker_management_app/REQ-72
