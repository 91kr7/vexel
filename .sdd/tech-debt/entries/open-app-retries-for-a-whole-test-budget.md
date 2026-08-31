---
id: open-app-retries-for-a-whole-test-budget
area: client
severity: medium
cost: correctness
date: 2026-08-31
source: planning of plan-docker_management_app-containers_card_view batch 4, the reconnaissance over client/e2e/
status: open
---

# `openApp` declares 30 seconds of retries, which is the whole budget of the test calling it

**What** → the helper every e2e check opens with retries for exactly as long as a test is allowed to
live. So each of those tests declares, in its first step, a patience equal to everything it has. The
retry can never run to its end and report its own message: the test dies first, on
`Test timeout of 30000ms exceeded`, saying nothing about the pin that was overtaken.

**Where** → `client/e2e/support/fixtures.ts:81` — `}).toPass({ timeout: 30_000 });` inside `openApp`.
The default test budget is Playwright's 30 000 ms, which `client/playwright.config.ts` does not
override.

**Evidence** → read from the source on 2026-08-31, not inferred. `client/e2e/` holds **562 tests
across 91 files**, and only 39 of those files raise a budget anywhere (165 `test.setTimeout` calls in
all). Every check calls `openApp`. It is the widest instance of the class batch 4 of
`plan-docker_management_app-containers_card_view` repairs — a step declaring more patience than the
test that runs it — and the only one that sits exactly on the line rather than over it, which is why
that batch's guard admits it and does not touch it.

**Why it matters** → it is right by accident. Anything that makes the default budget smaller, or
`openApp` slower, turns 562 passing checks into the same defect at once, all with a message that
names no cause. It is also the reason that batch's guard refuses only a budget **strictly greater**
than its test's: the honest rule is `greater or equal`, and adopting it would have refused 562 tests
for this one helper.

**Direction** → two ways out, and the choice is the human's. Give `openApp` a patience that fits
inside the smallest budget a caller has — which needs a measurement of what opening the application
costs, on a cold first call, that nobody has taken. Or give the tests explicit budgets, which is 562
declarations and only worth it as part of something larger. Whichever is chosen, the guard's rule
becomes `greater or equal` in the same turn, and the exception recorded in that batch is withdrawn.
