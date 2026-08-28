---
id: change-coverage-millisecond-window
area: server
severity: low
cost: correctness
date: 2026-08-28
source: batch startup-order-and-disowned-read, test phase
status: open
---

# A read starting in the same millisecond as a change is treated as covering it

**What** → `awaitChangeCoverage()` decides whether a read already covers a change the application
announced, by comparing two millisecond stamps: `this.changedAt <= this.held.startedAt`. A read that
*started* in the same millisecond as `markChanged()` therefore counts as covering the change — even
though it may have questioned the daemon before the operation completed. The caller is then served a
value that predates the very operation whose result it is waiting for.

**Where** → `server/src/refresh-cache/refresh-cache.ts`, `awaitChangeCoverage()`.

**Evidence** → found while writing the change-coverage case of
`server/test/unit/refresh-cache-disowned-read.test.ts`: the first version of the check failed for
this reason and had to separate the two events by 5 ms, with a comment saying why. The window is one
millisecond wide, and it is on REQ-13's path — an operation the operator performed through the
application being visible without waiting.

**Why it matters** → REQ-13 is the requirement whose failure this plan must not ship: the operator
acts and sees the result at once. A one-millisecond window is small, but it is the kind that widens
on a fast machine, where a write route and the refresher it marks can genuinely land in the same
millisecond.

**Direction** → compare on something that orders strictly rather than on a stamp that can tie — a
monotonic counter incremented by `markChanged()`, of the kind the discard already uses for its
generation. Pre-existing; untouched by the batch that found it.
