---
module: networks
component: useNetworkInspect
type: frontend hook
---

# useNetworkInspect

**Purpose** → reads a single network's inspect data, re-reading on selection change and whenever a
related daemon event arrives.

## Contract

- `useNetworkInspect(id: string | undefined): { inspect?: NetworkInspect, loaded: boolean, error?:
  string, refresh: () => void }`
  - Reads when `id` changes (to a defined value) and on every `network` or `container` daemon event.
  - Returns an empty, not-loaded result while `id` is `undefined` (no network selected).

## Requirements served

- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
