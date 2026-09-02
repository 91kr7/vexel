---
batch: batch-clean-daemon-recorded
feature: The artifacts describe the daemon reset every test file runs
closed_req: [REQ-63, REQ-64, REQ-65, REQ-66, REQ-67, REQ-68, REQ-69, REQ-70, REQ-71, REQ-72, REQ-73, REQ-74, REQ-75]
depends: []
---

# Batch — The artifacts describe the daemon reset every test file runs

**The code of this batch is already written.** It shipped in `909d63c` and `9a57e7b`, outside the
workflow, while the six batches above were being made green. What was skipped is the half the
workflow exists for: the architecture file, the module indexes, the component specs and the
registers still describe the arrangement that was replaced. This batch is that half, and nothing
else — it changes no source file and no check.

Read the source before writing a line of it: the reset itself is
`server/test/support/lifecycle.ts`, its two wirings are `client/e2e/support/lifecycle.ts` and
`server/test/support/api-lifecycle.ts`, the four npm steps go through
`server/test/support/run-lifecycle.ts`, and the guard is
`scripts/check-clean-daemon-conformance.mjs`. `CLAUDE.md` states the rules and the reasons at
length and is the human's own text; where an artifact and the code disagree, **the code is what
happened** — say so in the report rather than writing the artifact's version down again.

## What is stale, and where

The census below is the perimeter. Nothing outside it was found to have drifted: every path quoted
in a module index still exists.

- **`.sdd/.archi`, the test section (about lines 146–232)** — the largest piece. It names
  `npm run test:destructive` and `scripts/destructive-tests.mjs`, both removed; the preload
  `test/support/fresh-data-dir.ts`, replaced by `test/support/api-lifecycle.ts`; the `sweep`,
  `images` and `registry` steps as things that "run automatically before the two daemon-backed
  passes", which they no longer do; `test:api` as running "files in parallel", which is now serial;
  and `client/e2e/support/global-setup.ts` and `global-teardown.ts` as the two files isolating a run,
  of which only the teardown survives and it lives in `client/e2e/support/lifecycle.ts`.
- **`.sdd/modules/timing-scale/`** — the index row and `specs/suite-timing-configuration.md` both
  speak of "the two daemon-backed server passes". One is left.
- **`.sdd/modules/refresh-cache/specs/refresh-cache.md`** — the contract of
  `registerRefreshKind({ periodMs })` does not say the figure is scaled, and the rule stating what
  the timing scale multiplies names two defaults, not the period.
- **`.sdd/tech-debt/entries/builder-writes-mark-one-inventory-of-the-two-they-change.md`** — points
  at `client/e2e/exclusive/build-cache-prune.spec.ts`; the directory is gone and the file is
  `client/e2e/build-cache-prune.spec.ts`.
- **The guard has no home at all.** `scripts/check-clean-daemon-conformance.mjs` has neither an
  index row nor a spec, while the other three checks of its kind each have both:
  `list-order/specs/list-order-conformance-check.md`,
  `check-budgets/specs/check-budget-conformance-check.md`,
  `coverage/specs/swarm-absence-conformance-check.md`.
- **`CLAUDE.md` contradicts the code in two places**, and both are the human's text, so both are
  reported rather than rewritten unasked: it places the guard under `client/scripts/` when it is at
  `scripts/`, and it says Docker contexts are one of the two things the reset does not empty, while
  `removeCreatedContexts()` removes every context that is neither `default` nor the current one —
  which is also what the same document says two paragraphs earlier ("removing a context is the
  reset's job").

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `.sdd/.archi`, test section | Replace the stale account with what runs: the reset before every file, wired per tree and why the two wirings differ; what it removes and the three things it spares; the base images restored out of the run's own registry; the four lifecycle steps behind one entry point, as commands an operator types and not a preparation pass; `test:api` serial and preloading the reset; the single Playwright project with no `globalSetup` and a `globalTeardown` that stops the registry. Remove what no longer exists. | REQ-63, REQ-64, REQ-65, REQ-66, REQ-67, REQ-69, REQ-70, REQ-71, REQ-73 | — |
| INT-2 | create | module `check-budgets` or a home of your choosing among the existing modules — decide it and say why | The clean-daemon conformance check as a component: its index row and its spec. What it refuses in each tree, that the end-to-end tree to scan is its first argument, that it has no exception marker, and where it is wired in. Follow the three sibling specs for shape. | REQ-72, REQ-73 | — |
| INT-3 | modify | `.sdd/modules/refresh-cache/specs/refresh-cache.md` and its index row | The declared period is put on the process's clock, like the two defaults already stated there. State what a caller's figure becomes at a factor other than `1`. | REQ-74, REQ-75 | — |
| INT-4 | modify | `.sdd/modules/timing-scale/index.md` and `specs/suite-timing-configuration.md` | One daemon-backed server pass, not two. | REQ-71, REQ-73 | — |
| INT-5 | modify | `.sdd/tech-debt/entries/builder-writes-mark-one-inventory-of-the-two-they-change.md` | The spec it names is at its current path. | REQ-71, REQ-73 | — |
| INT-6 | modify | `.sdd/knowledge-base/`, if and only if an entry is wrong | `destructive-tests-run-beside-the-rest` was already updated in `9a57e7b`. Read it and the index row against the code; correct only what is false, and add nothing. | REQ-73 | — |

> **INT-2 is the only judgement call in the batch.** Three of the four checks live in the module
> whose rule they guard, and no module owns the test lifecycle. Choosing an existing home is
> preferred over opening a module for one component; if none fits, say so and propose one rather
> than creating it silently.
>
> **Nothing here touches a plan or an analysis.** The census above lists live artifacts only.

## Human acceptance

### Scenario: the architecture file describes the commands that exist

- REQ → REQ-70, REQ-71, REQ-73
- Given → `.sdd/.archi`
- When → the human runs every command it names
- Then → each one exists and does what the file says; nothing removed is still described

### Scenario: the guard is documented like its three siblings

- REQ → REQ-72, REQ-73
- Given → the four build-time guards of this repository
- When → the human opens the index row and the spec of each
- Then → the clean-daemon check has both, and they read like the other three

### Scenario: the cache's contract states what a period becomes

- REQ → REQ-74, REQ-75
- Given → the spec of the refresh cache
- When → the human reads what `periodMs` means
- Then → it says the figure is scaled by the process's factor, and what it is at a factor of `1`
