---
id: layer-explorer-cancel-races-the-analysis
area: client
severity: low
cost: correctness
date: 2026-08-28
source: full e2e pass closing plan-docker_management_app-refresh_cache
status: open
---

# A check presses Cancel on an analysis that has already finished

**What** → the check presses Analyze and then immediately Cancel, expecting to be returned to
"Changesets not analyzed yet". Its fixture is a 26-byte single-layer image, so the analysis can
complete before the cancel lands, and the modal then correctly lists the result.

**Where** → `client/e2e/layer-explorer.spec.ts:116`.

**Evidence** → reproduced 1 of 2 with `--repeat-each=2` over the whole file; passes when the check
runs alone. The failure snapshot shows the analysis finished — the modal lists
`PATH SIZE added single-file.txt 26B` — which is the product behaving correctly.

**Why it matters** → the check is not wrong about the product, it is wrong about timing: it asserts
an outcome that only holds if the cancel wins a race it has no way to win reliably. A check that
passes on speed rather than on contract fails on a faster machine, or a slower one, for no reason a
reader can see.

**Direction** → make the cancel deterministic rather than fast: hold the analysis open until the
cancel has been pressed, or drive the check with a fixture large enough that the window is real.
Whichever is chosen, the check should state which of the two it relies on.
