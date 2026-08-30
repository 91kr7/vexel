---
id: a-neutralisation-is-undone-before-delivery
kind: guideline
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# A temporary neutralisation is undone before the phase is delivered

**Rule** → When the source is altered to obtain the red run a requirement asks for, the alteration
is undone before the phase is handed back. At the close of every test phase, **verify that
`git diff server/src/` and `git diff client/src/` are empty** against the development commit, and
say so explicitly in the report.

**Why** → it has already cost a pass: a test phase switched the correction off in the source to get
its red run and never switched it back on. The product ran that way through an entire e2e pass, the
defect intact, looking like a cure that had failed.

**How to apply** →
- *test* → the report of a test phase carries the sentence in as many words: the two diffs are
  empty.
- *any* → the orchestrator checks it too, before committing the phase; it is a mechanical check, not
  a matter of trust.
