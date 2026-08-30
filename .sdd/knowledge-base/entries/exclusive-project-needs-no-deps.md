---
id: exclusive-project-needs-no-deps
kind: how-to
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# Running the exclusive project alone requires `--no-deps`

**Rule** → `--project=exclusive` **without** `--no-deps` runs the whole suite as its prerequisite —
645 tests instead of 8. `--no-deps` is not optional.

**Why** → the `exclusive` project declares `dependencies: ['chromium']` in
`client/playwright.config.ts`, so Playwright schedules the entire parallel project ahead of it.
Verified by the human with `--list`.

**How to apply** →
- *test* → to run only the destructive specs: `npm run test:e2e -w client -- --project=exclusive
  --no-deps`. A full pass keeps the form of [[full-suite-commands]], which needs no flag of its own.
