---
id: an-intermittent-failure-is-reproduced-first
kind: how-to
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# An intermittent failure is reproduced before it is explained

**Rule** → A failure that comes and goes is pinned down before a cause is written for it.
`--repeat-each=3` on a single spec file is the tool.

**Why** → the refresh-cache defect showed only on a warm server: the first run of a spec always
passed. `--repeat-each=3` on that one file is what nailed it. An explanation written before the
reproduction is a guess dressed as a diagnosis.

**How to apply** →
- *test* → one spec file, repeated, one Playwright process at a time
  ([[one-playwright-process-at-a-time]]).
- *test* → and mind the state the repetition inherits: a defect visible only on the second run is a
  defect of a warm process, which a fresh one hides.
