---
id: build-cache-prune-guard-blocked-by-run-fixtures
area: client
severity: medium
cost: correctness
date: 2026-08-28
source: full e2e pass closing plan-docker_management_app-refresh_cache
status: open
---

# The build-cache prune check can never run in a full pass, because the run itself fills the cache

**What** → the exclusive check that prunes the build cache guards itself first: it refuses to issue a
host-wide prune unless every record it would reclaim is its own. In a full pass that guard always
refuses, because earlier specs' fixture builds have left records of their own in the host's build
cache. The product assertion is never reached.

**Where** → `client/e2e/exclusive/build-cache-prune.spec.ts:80`, the guard
`expect(before.filter(record => !ownIds.has(record.id))).toEqual([])`.

**Evidence** → seen twice on 2026-08-28. Once with 1.016 GB of records left by the chromium project's
own image builds 42 minutes earlier; once with records named by other specs' fixtures in the same run
(`printf 'v2' > /data/waste.bin`, `match-target-$i.txt`). The guard is behaving exactly as designed —
it is the arrangement around it that makes it unsatisfiable.

**Why it matters** → this is a check that cannot pass where it is scheduled, so it reports a failure
that says nothing about the product, every time. A check that always fails is read as noise and then
stops being read at all, which is worse than not having it.

**Direction** → the guard is right and should stay: a host-wide prune must never reclaim what it
cannot prove is its own. What needs to change is what the check asserts. A prune scoped to its own
records, or an assertion on the reclaim report rather than on the whole host, would let it verify the
product without needing an empty machine it will never get.
