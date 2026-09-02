---
id: builder-writes-mark-one-inventory-of-the-two-they-change
area: server
severity: medium
cost: correctness
date: 2026-08-31
source: batch exclusive-checks-reload, INT-2 — found while closing the same hole for select-active
status: open
---

# Removing a builder, and pruning the cache, each mark one inventory of the two they change

**What** → the builder inventory and the build-cache inventory are coupled through buildx, and two
write paths mark only one of them:

- `removeBuilder` — removing the **active** builder returns buildx to the default one, so the cache
  `buildx du` answers for changes with it. Only the builder inventory is marked, so for up to the
  kind's thirty seconds the Build cache list on screen is still the removed builder's records.
- `pruneBuildCache` — a prune changes the `cacheBytes` figure every builder row carries
  (`buildx ls` reads it per builder). Only the build-cache inventory is marked, so for up to a
  period the builders list still reports the size the cache had before the operator pruned it.

**Where** → `server/src/builders/builders-service.ts`, `removeBuilder`;
`server/src/builders/build-cache-service.ts`, `pruneBuildCache`.

**Evidence** → both were read at the source while implementing INT-2 of
`plan-docker_management_app-refresh_cache`, batch `exclusive-checks-reload`, which closed the
identical hole for `useBuilder` (REQ-65): selecting a builder changed whose records the build-cache
inventory held and marked only the builder inventory. These two are the same shape, in the same
module, and neither is reached by any check — `client/e2e/build-cache-prune.spec.ts`
removes its builder in the `finally`, after every assertion, and no spec asserts a builder row's
size after a prune.

**Why it matters** → this is the same gap in REQ-13 of that plan: what the operator does through the
application is visible at once, without waiting out a period. Here the screen keeps showing, for up
to thirty seconds, figures the operator's own action has already made false.

**Direction** → mark both inventories at both sites, with the reason on the spot, as `useBuilder`
now does; and give each a check, since today neither would notice. Deliberately not repaired in
`exclusive-checks-reload`: that batch closes REQ-65 and nothing wider.
