---
id: the-human-launches-the-full-pass
kind: guideline
scope: development, test
date: 2026-09-01
source: chat, during /sdd-plan for the timing-scale cycle; already stated twice during the same session on the e2e timing measurements
---

# The human launches the full pass, not the agents

**Rule** → "Non lanciare i test full! Li lancio io." A full pass is never started by an agent: the
agent says a full pass is now due, and stops. The human runs it and brings back the result.

**Why** → the human gave this as a standing arrangement, having already taken the last two runs
themselves ("li misuro io"). A full pass costs between twenty and fifty minutes and holds the
machine's Docker daemon for all of it; whose turn it is to spend that is the human's call, not an
agent's.

**How to apply** →
- *test* → when the workflow says a full pass is due, report that it is due, state the exact command
  from [[full-suite-commands]], and stop. Do not run it, and do not run a substitute for it.
- *test* → this covers the **full** passes only. A single spec file, a single test file, a
  typecheck, a lint or a conformance check stays with the agent — that is the work between passes
  [[one-playwright-process-at-a-time]] already describes.
- *development* → a batch that would otherwise be certified on a full pass waits for the human's
  result instead: it is not certified on an agent's own reasoning that it would have been green.
