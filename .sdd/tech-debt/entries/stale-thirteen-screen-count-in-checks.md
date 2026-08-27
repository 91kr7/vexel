---
id: stale-thirteen-screen-count-in-checks
area: client
severity: low
cost: correctness
date: 2026-08-28
source: chat, while counting the e2e suite after the swarm removal
status: open
---

# Thirteen checks still say "thirteen screens" on a rail that has twelve

**What** → the swarm withdrawal took the navigation from thirteen entries to twelve. The count was
carried into the source, the component specifications, their indexes, `CLAUDE.md` and `README.md`,
but **not into the check trees**: thirteen mentions of "thirteen" survive there, in comments, in a
test title and — this is the part that is not merely cosmetic — in two assertion messages.

**Where** → `client/e2e/nav-rail-reachable.spec.ts:14,136,226,233,234,368`;
`client/e2e/header-controls-truthful.spec.ts:34,262,744`;
`client/e2e/closing-invariants.spec.ts:8,220`;
`client/test/unit/copy-affordance-absence.test.ts:139`;
`client/test/unit/property-columns-contract.test.tsx:148`.

Two of them are printed to a human when a check fails:

- `nav-rail-reachable.spec.ts:226` — "only N of the **thirteen** destinations could be reached with
  a real pointer"
- `nav-rail-reachable.spec.ts:368` — "**thirteen** entries read as the ten that are painted"

**Evidence** → measured, not asserted: the whole e2e suite is green at 627 passed, and
`nav-rail-reachable` passes at all three viewports. It passes because every assertion derives its
count from `DESTINATIONS.length` and never from the literal — the prose is the only thing carrying
the number. `grep -ri thirteen` over `client/src`, `server/src`, `.sdd/modules`, `CLAUDE.md` and
`README.md` returns nothing; the same grep over `client/e2e` and `client/test` returns thirteen.

**Why it matters** → nothing is broken today, and nothing will break tomorrow: the counts are
derived. The cost is paid by the next person to read a failure. A message that announces thirteen
destinations while twelve exist sends them looking for a missing screen that was removed on purpose,
and the two unit-test comments anchor a "delivered thirteen" baseline that no longer describes what
was delivered. The register exists for exactly this: understood, measured, not worth widening the
swarm cycle for.

**Direction** → replace the number where the rail is what is being counted, and check the two unit
comments individually rather than sweeping them: "the delivered thirteen" may be a deliberate record
of a historical baseline, in which case it is dated rather than corrected. One mention is already
correct and must not be swept — `client/e2e/swarm-withdrawn.spec.ts:109` says "an unlabelled
thirteenth would pass", which is the check asserting there is no thirteenth. A grep-and-replace over
the word would break that one.
