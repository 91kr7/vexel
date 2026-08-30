---
id: save-the-traces-before-the-next-run
kind: how-to
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# Put the traces in safety before launching another run

**Rule** → Before every new e2e run, copy the traces of the previous one out of the repository.
Playwright empties `client/test-results/` at the start of each run, so a trace not moved is a trace
lost.

**Why** → the human copied the five traces of the interrupted run of 2026-08-31 to
`~/Desktop/vexel-traces-<date>/` for exactly this reason, and said to keep doing it "con lo stesso
criterio" for every run that follows.

**How to apply** →
- *test* → one directory per run, outside the repository, named by date; the whole
  `client/test-results/` tree, `trace.zip` and `error-context.md` together.
- *test* → then read them: [[read-playwright-traces-without-a-browser]].
