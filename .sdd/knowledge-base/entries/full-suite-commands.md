---
id: full-suite-commands
kind: how-to
scope: test
date: 2026-08-28
source: /sdd-dev, batch inspect-full-payload; scope corrected during batch read-once-values
---

# The two commands a full pass is run with

**Rule** → When a full pass is called for, it is run with exactly these two commands, and no other
form of them:

```
npm run test:e2e -w client -- --quiet
npm run test
```

**Why** → The human gave these as the two commands to use ("questi sono i due comandi che devi
usare"). The e2e one is the full, unfiltered pass, and `--quiet` keeps its output readable.
`npm run test` is the root command, so it covers both workspaces rather than the client alone.

**How to apply** →
- *test* → do not substitute a variant: not a filtered e2e run, not `npm run test -w server`, not a
  direct `playwright test` invocation. These two, as written.
- *test* → **when** a full pass is called for is not this entry's business. That is written in the
  workflow prompts of `/sdd-dev` and `sdd-tester`; read it there. This entry was previously carrying
  a schedule of its own, which the human never stated and which contradicted the workflow.
