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
    new value on the next render) and persists it via `savePreferences`.
  - **No update is ever lost, whenever it is issued.** An update issued before the initial read has
    settled is not written straight away — writing then would let a default overwrite the stored
    preferences — but it is *deferred, never dropped*: it is accumulated and flushed as a single
    `savePreferences` call the moment the read settles, whether the read succeeded or failed.
  - An update issued before the read settles is the more recent intent and wins: the value the read
    returns is applied *underneath* the accumulated keys, so neither `preferences` nor the persisted
    record is rolled back to what the read said for those keys.
  - Several updates issued before the read settles are merged, last write per key winning, and
    persisted as one call.
  - A failed `savePreferences` (and a failed initial read) is swallowed: preferences are a
    convenience, never a reason to break the operator's action.

Deferral rule, in the form any implementation must satisfy:

```
updatePreferences(patch):
  preferences := preferences merged with patch
  if the initial read has settled → savePreferences(patch)
  else                            → pending := pending merged with patch

when the initial read resolves:  preferences := stored merged with pending
when the initial read settles:   loaded := true
                                 if pending is not empty → savePreferences(pending); pending := {}
```

## Rules and invariants

- Every `updatePreferences` call reaches the server exactly once, in call order, regardless of how
  soon after mount it is issued — the initial read delays a write, it never cancels one.
- The initial read's response never overwrites a key the operator has already changed in this
  session.

## Dependencies

- Preferences client (fetchPreferences, savePreferences)

## Requirements served

- plan-docker_management_app/REQ-115
