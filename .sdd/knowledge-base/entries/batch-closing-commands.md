---
id: batch-closing-commands
kind: how-to
scope: test
date: 2026-08-28
source: /sdd-dev, batch read-once-values
---

# The two commands that close the plan

**Rule** → The two full suites are run once, at the close of the **last batch of the plan**, with
exactly these commands and no other form of them:

```
npm run test:e2e -w client -- --quiet
npm run test
```

During every earlier batch only that batch's own tests are run: the unit checks written for it and
the e2e files written for it. Nothing wider.

**Why** → The human gave these two commands as the ones to use ("questi sono i due comandi che devi
usare"), and then said when to use them: "da specifiche i full e2e e unit sono da eseguire alla
fine". A full pass costs about twenty minutes. Paying that on every batch of a five-batch plan buys
nothing the closing pass does not already prove.

**How to apply** →
- *test* → inside a batch, run the tests written for that batch and no others. Those are what the
  batch is certified on.
- *test* → on the last batch of the plan, run both commands above in full. Their outcome is what the
  plan is reported on.
- *any* → this supersedes the earlier arrangement, in which both commands ran at the end of every
  batch.
