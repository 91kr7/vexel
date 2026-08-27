---
id: batch-closing-commands
kind: how-to
scope: test
date: 2026-08-27
source: /sdd-dev, batch inspect-full-payload
---

# The two commands that close a batch

**Rule** → At the end of every batch both suites are run, with exactly these two commands and no
other form of them:

```
npm run test:e2e -w client -- --quiet
npm run test
```

**Why** → The human stated them as the two commands to use ("questi sono i due comandi che devi
usare"). The e2e pass is the full, unfiltered one — `--quiet` keeps its output readable — and
`npm run test` is the root command, so it covers both workspaces rather than the client alone.

**How to apply** →
- *test* → the batch is not closed on filtered runs: after the batch's own spec files pass, both
  commands above are run in full, at the end of the batch, and their outcome is what the batch is
  reported on.
- *any* → this supersedes the earlier arrangement in which the unfiltered e2e pass was left to the
  human and each batch was certified on filtered runs alone.
