---
batch: 3 · volumes-panel
feature: F3 — Volumes, with the anonymous ones grouped last
closed_req: REQ-13, REQ-14, REQ-15, REQ-16
depends: 1
---

# Batch 3 — Volumes, with the anonymous ones grouped last

Requirements are in `../requirements.md` and are cited here by id only.

## Why this list is not just "sort by name"

An anonymous volume's name begins with `0`–`9` or `a`–`f`, so sorting the whole list by name
**interleaves** them: `3f9a…` lands between `api-data` and `backup`, in their thousands on a working
machine. That is not an order, it is interference — and it is the visible half of this batch
(REQ-13, REQ-14).

The operator does not look these up by name, because there is no name to look up by: they are swept,
not visited. Recency is the only ordering that carries information for a row with no name — the
leftovers of the run just performed are the ones with any chance of being recognised.

**What identity this list has**: `VolumeSummary` carries `{ name, driver, mountpoint, scope,
createdAt, labels, options, sizeBytes?, mountedBy }` — **no id**. The name is the identity, and
`createdAt` is available, which is what makes newest-first possible. Comparing the name again as the
final step is not redundant: `Data` and `data` tie under the name comparison and are separated only
by the exact one (REQ-5).

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/volumes/volumes-service.ts` | `listVolumes` returns named volumes first, ordered by name under batch 1's rule; then every anonymous volume, ordered newest first by `createdAt`, with the name compared exactly as the final comparison. Use batch 1's named-first / unnamed-group-last helper rather than expressing the shape again here. A volume is anonymous when its name is **exactly 64 hexadecimal characters** — the shape the daemon generates. A volume an operator deliberately named that way is grouped with them and is **not** rescued by a heuristic (REQ-15): it is cosmetic, it affects a row nobody creates by accident, and the alternative is scattering thousands of hex names through the named ones. `sizeBytes` and `mountedBy` are computed as before; nothing about which volumes are listed changes. | REQ-13, REQ-14, REQ-15, REQ-16 | — |
| INT-2 | modify | `server/test/unit/volumes-service.test.ts` | Add, from a stubbed payload deliberately out of order: named volumes ordered and **all ahead of** every anonymous one; inside the anonymous group, newest `createdAt` first; a 64-hex name grouped with the anonymous ones whoever created it; a tie pair whose names differ only in case, separated deterministically; and **the same payload supplied in both possible orders producing the same result** (REQ-6's shape, applied to this list). Correct — never loosen — any existing assertion that only passed because the stubbed list came back in the order it was written in. | REQ-13, REQ-14, REQ-15, REQ-16 | INT-1 |

## Done when

- The volumes panel shows named volumes in name order, with every hex-named one below all of them,
  newest first.
- `npm run test:typecheck -w server` passes and `volumes-service.test.ts` passes, run narrowed: from
  `server/`, `node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/volumes-service.test.ts`.
- Batch-scoped runs only. The full unit suite and the e2e suite are not this batch's business.
