---
id: destructive-tests-run-beside-the-rest
kind: guideline
scope: test
date: 2026-09-02
source: chat, after the destructive specs were skipped behind an unrelated red
---

# The destructive tests run beside every other file

**Rule** → There is no separate directory and no separate Playwright project for the tests that act
on the whole host. They live in `server/test/api/` and `client/e2e/` with everything else, and
`npm run test:destructive` is what runs them alone.

**Why** → The human asked for the split to be ended and was right on the facts. Two halves:

- **What it cost.** The `exclusive` project declared `dependencies: ['chromium']`, so one unrelated
  red anywhere in the suite skipped all eight destructive specs — silently. That is what happened:
  a single failure in `layer-build-cache` left them unrun, and the arrangement hid it.
- **Why it was no longer buying anything.** The assistant argued the split protected later specs
  from a mid-run prune, and that was wrong. **Every file re-establishes what it needs at the point of
  use**: `server/test/support/base-images.ts` restores a missing base image from the run's own
  registry, no network, and its own header says it exists for exactly this — "restored from there
  whenever it goes missing again (the exclusive pass prunes the host mid-run)". Both passes are
  serial (`workers: 1`, `--test-concurrency=1`), so a prune can never reach a fixture still in use.

**How to apply** →
- *test* → a new destructive file goes in the ordinary directory, and its name goes on the list in
  `scripts/destructive-tests.mjs`. The script fails when a file on that list is not on disk, so a
  rename cannot quietly shrink what the command covers.
- *test* → to run only the destructive ones: `npm run test:destructive`, or `-- server` / `-- client`
  for one tree. A full pass keeps the form of [[full-suite-commands]].
- *any* → the general lesson, which is why this is a guideline and not a how-to: before defending an
  arrangement on the ground that something downstream would break, check whether the codebase already
  repairs it. Here it did, in a file whose own comment said so.
