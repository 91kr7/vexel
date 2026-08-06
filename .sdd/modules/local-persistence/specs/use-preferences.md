---
module: local-persistence
component: usePreferences
type: frontend hook
---

# usePreferences

**Purpose** → the client-side read/write/defaults surface for operator preferences, and the
foundation the shell restores its startup state from (REQ-115).

## Contract

- `usePreferences(): { preferences: OperatorPreferences, loaded: boolean, updatePreferences: (patch:
  Partial<OperatorPreferences>) => void }`
  - `preferences` starts as `DEFAULT_PREFERENCES` and is replaced by the server's stored value once
    the initial `fetchPreferences()` resolves.
  - `loaded` becomes `true` once the initial fetch has settled (successfully or not); callers use it
    to distinguish "not yet known" from "known and empty".
  - `updatePreferences(patch)` merges `patch` into `preferences` immediately (so the caller sees the
    new value on the next render) and persists it via `savePreferences`, but only once `loaded` is
    `true` — an update issued before the initial load has settled would otherwise overwrite the
    stored preferences with defaults.

## Dependencies

- Preferences client (fetchPreferences, savePreferences)

## Requirements served

- plan-docker_management_app/REQ-115
