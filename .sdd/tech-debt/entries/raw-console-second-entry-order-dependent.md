---
id: raw-console-second-entry-order-dependent
area: client
severity: medium
cost: correctness
date: 2026-08-28
source: full e2e pass closing plan-docker_management_app-refresh_cache
status: open
---

# The raw console's second transcript entry never completes when its whole file runs

**What** → a check that runs two commands in the raw console sees only the first one's transcript
entry. The second command's text is present as the in-flight prompt line, but its entry is never
completed.

**Where** → `client/e2e/copy-affordance-absence.spec.ts:725`;
`expect(entries).toHaveCount(2)` times out at 30 s with 1.

**Evidence** → **not a flake, and the earlier reading of it as one understates the problem.** It
passes 2 of 2 when the check is run alone, and fails 2 of 2 when the whole file runs. The failure
snapshot shows the first entry complete (`exit 0`, `Re-run`) and the second command's text sitting on
the prompt line. Seen in two consecutive full passes, on 2026-08-28.

**Why it matters** → an order-dependent failure is either a check that inherits state it should not,
or a product defect that only a particular sequence exposes. Which one is unknown, and that is the
point: it has been carried through two full passes as "a flake" without either being established.
Console history is not held by the refresh cache, so neither plan of 2026-08-28 explains it.

**Direction** → establish which of the two it is before deciding anything: run the file with the
preceding checks removed one at a time. If the product is at fault the console is where to look, and
this is then a fix and not debt — see the register's own boundary.
