---
module: system
component: useDiskUsage
type: frontend hook
---

# useDiskUsage

**Purpose** → holds the reclaimable-space breakdown for the screen and drives the prunes over it,
keeping the breakdown true to the host after each one.

## Contract

- `useDiskUsage(): { breakdown?, loaded, error?, refresh, prune }`
  - `breakdown` — the last successfully read `DiskUsageBreakdown`; `undefined` until the first read
    succeeds.
  - `loaded` — `true` once a read has settled, successfully or not.
  - `error` — the failure message of the last read; cleared by the next successful one, which also
    replaces the breakdown.
  - `refresh()` — re-reads the breakdown.
  - `prune(scope): Promise<PruneRunResult>` — prunes the named categories, then re-reads the
    breakdown; rejects if the request itself fails (a per-category failure is reported inside the
    result, not as a rejection).

## Rules and invariants

- The breakdown is re-read after every prune, so what the screen shows is the host after the run,
  never the estimate that preceded it (REQ-96).
- It is also re-read on every `container`, `image`, `volume` or `network` daemon event: what is
  reclaimable changes when the host's objects do, whoever changed them. A burst of such events —
  a prune emits one per removed object — leads to a single re-read, not one per event.
- The affected lists of the other screens follow the same prune through that same event stream —
  each list hook already subscribes to it — so a prune does not need this hook to refresh them, and
  no second refresh path duplicates that one.
- It does not poll: the daemon's disk-usage reading is expensive on a large host, and a screen left
  open must not keep the daemon busy computing it.
- A context switch drops what is held and re-reads at once: the breakdown belongs to a daemon, not
  to the screen (REQ-93).
- A read that settles after the hook is unmounted updates nothing.

## Dependencies

- system: System client
- events: Event stream client (`subscribeToDaemonEvents`)
- contexts: active-context broadcast (`subscribeToActiveContextChange`)

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
