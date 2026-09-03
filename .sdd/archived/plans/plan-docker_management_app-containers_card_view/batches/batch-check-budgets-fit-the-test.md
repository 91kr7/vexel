---
batch: check-budgets-fit-the-test
feature: F4 — Every check declares a budget it can spend
closed_req: REQ-64, REQ-65, REQ-66, REQ-67, REQ-68, REQ-69, REQ-70, REQ-71, REQ-72
depends: 3
---

# Batch — every check declares a budget it can spend

The requirements are in `../requirements.md` and are cited here by id.

**This batch changes no product source.** Nothing under `client/src/` or `server/src/` moves. The
sampler keeps the 10-second cadence batch 3 certified (REQ-39), and no component spec of the product
changes. It is a correction to the checks (REQ-68).

## What is wrong with the check

`client/e2e/containers-card-geometry.spec.ts:915` — *"a live update changes the numbers, moves
nothing, and leaves the ports exactly as they were"* — died on `Test timeout of 30000ms exceeded` in
the run of 2026-08-31.

The test has 30 seconds. `client/playwright.config.ts` declares no `timeout`, so every test in the
suite gets Playwright's default. Here is where those 30 seconds go.

| what the test does | what it declares | where the declaration is |
|---|---|---|
| creates three fixtures with four published ports | nothing | five `docker` calls |
| opens the screen and waits for three cards | 20 s | `openNarrowedTo` |
| waits for the error banner to be absent | 20 s | `openNarrowedTo` |
| waits for the first sample to reach the card | 25 s | `waitForASample` |
| waits for a reading to change | **40 s** | the case's own `expect.poll` |
| re-reads the ports three times, 1.5 s apart | nothing | the case itself |

**The 40 seconds can never be spent.** The poll gets what is left of the 30, about fifteen seconds.
After it the test still needs 6 to 8 seconds for the port re-reads.

**The slowness is not the defect.** The sampler reads every 10 seconds
(`STATS_SAMPLE_INTERVAL_MS`, `server/src/containers/containers-service.ts:179`), the cadence batch 3
of this plan decided and certified (REQ-39). A sample reaches the card through the list poll, every
3 seconds (`POLL_INTERVAL_MS`, `client/src/data/use-containers.ts`). So "wait until a reading
changes" costs one sampling interval, sometimes two. The test needs 35 to 45 seconds and declares 30.
It was passing by luck.

## The perimeter: seven files, 23 tests

The same search over `client/e2e/` — a step declaring a longer patience than the test that runs it —
found six more files. Every one of them passes today.

| file | the step, and what it declares | tests affected |
|---|---|---|
| `containers-card-geometry.spec.ts` | the live-update poll, 40 s; the first-sample wait, 25 s; `openNarrowedTo`'s two waits, 20 s each | 12, the whole file |
| `filesystem-browser.spec.ts` | `createManyEntryImage`'s `docker build`, **300 s** | 1 |
| `dialog-sizing.spec.ts` | `openFilesystemBrowserDialog`'s extraction wait, 60 s | 3 |
| `copy-affordance-geometry.spec.ts` | the extraction's tree wait, 60 s | 1 |
| `copy-affordance-absence.spec.ts` | the extraction's tree wait, 60 s | 1 |
| `local-persistence.spec.ts` | `seedAnalysisCache`'s extraction request, 60 s | 1 |
| `refresh-cache-immediacy.spec.ts` | `writeFinished`'s response wait, 60 s | 4 |

**One case sits exactly on the line and is admitted.** `openApp`
(`client/e2e/support/fixtures.ts:81`) retries for 30 s, which is the default budget itself — so every
test in the suite declares, in its first step, a patience equal to everything it has. It is the widest
instance of the class. **This batch does not touch it**, for two reasons: 562 tests call it, and
nobody has measured what opening the application costs, so any smaller number would be a guess of the
kind this batch exists to refuse. The guard's rule admits it (INT-9). It is on the register as
`open-app-retries-for-a-whole-test-budget`, with the evidence and the two ways out, so the class is
not thought closed by anyone reading only this batch.

## The rule this batch adopts

> A test declares a budget that covers **what its steps spend when they succeed**, each at its own
> worst, **plus the largest single step budget** on top. The addition is there so that a step which
> does run out of patience fails with its own message, instead of killing the test somewhere else.
> It is not the sum of every worst case: the first step to exhaust its budget ends the test, so two
> ceilings are never reached in one run.

The part a machine can check follows from it: **every step budget is strictly smaller than the budget
of the test that runs it** (REQ-64, REQ-69).

## The numbers, and where each one comes from

**The step budgets of `containers-card-geometry.spec.ts` come down, because the product states what
they cost** (REQ-66).

| step | now | was | the count |
|---|---|---|---|
| the first sample reaches the card | **16 s** | 25 s | one sampling interval (10 s) + one list poll (3 s) + 3 s slack |
| a reading changes | **25 s** | 40 s | two sampling intervals (20 s) + one list poll (3 s) + 2 s slack |

Two intervals and not one: the figure the card is already showing may be a whole interval old, and a
sample whose reading repeats the last one changes nothing. That is the "sometimes two" case, and it
is the one the 30-second budget could not hold.

`openNarrowedTo`'s two waits stay at 20 s each. Nothing measured says they are wrong, and moving them
would be tuning.

**The test budget of that file goes up, to one number for the whole file** (REQ-65). Twelve tests of
one shape, one budget, so twelve numbers cannot drift apart.

| what the budget must hold | s | why |
|---|---|---|
| fixtures created and removed | 25 | the file's worst case is twelve containers created and removed in the `finally` |
| the screen opens, narrowed to the fixtures | 40 | the two waits `openNarrowedTo` declares |
| the first sample | 16 | above |
| a reading changes | 25 | above |
| the port re-reads and the settled measurements | 14 | three 1.5 s waits, plus the measurement passes |
| **the file's budget** | **120** | |

**The other six files keep the ceilings they have, and their tests declare a budget that can hold
them.** Their steps are one-off pieces of daemon work — an image build, a filesystem extraction, a
compose project brought up — and nobody has measured a bound for any of them. Lowering such a ceiling
would be a number invented to look tidy, which is the move this batch refuses. So the ceiling stays
and the test says what it really allows itself.

| file | the test's budget | the count |
|---|---|---|
| `filesystem-browser.spec.ts`, the cancellation case | 360 s | the 300 s build it allows, plus ~60 s for the fixtures, the screen and the gestures |
| `dialog-sizing.spec.ts` (3 tests) | 120 s | the 60 s extraction, plus ~40 s for the image, the screen and the menu gesture, plus cleanup |
| `copy-affordance-geometry.spec.ts` (1 test) | 120 s | the same shape |
| `copy-affordance-absence.spec.ts` (1 test) | 120 s | the same shape |
| `local-persistence.spec.ts` (1 test) | 120 s | the 60 s extraction request, plus the screen and the two cache readings |
| `refresh-cache-immediacy.spec.ts` (3 object cases) | 90 s | the 60 s write, plus the fixture, the screen and the 6 s the case measures |
| `refresh-cache-immediacy.spec.ts` (the compose case) | 120 s | the same, and a compose project created and brought up through the CLI |

**These budgets are not raised to make anything pass.** All 23 tests pass today. What is repaired is
the declaration: a step that cannot reach its own ceiling can never print its own failure message,
and the test dies at an arbitrary place with a message that says nothing.

## What this batch builds

- **The check-budget guard** — a build-time check over `client/e2e/`, refusing a step budget larger
  than the budget of the test that runs it. The fourth build check of this repository, after the UI
  conformance check, the list-order check and the swarm-absence check, and built to their shape: a
  Node script, no compiler, one line per violation.
- **The `check-budgets` module** — the rule and its guard, indexed together. `list-order` is the
  precedent for a module that is one rule plus the check that keeps it true. Without it the guard is
  a script no index names.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/playwright.config.ts` | Declare the default per-test budget explicitly, at Playwright's own 30 seconds, under a named constant. Nothing changes at run time. The ceiling every step budget is measured against is now written down, and the guard reads it from here. | REQ-70 | — |
| INT-2 | modify | `client/e2e/containers-card-geometry.spec.ts`, `waitForASample` | Budget from 25 s to 16 s: one sampling interval, one list poll, 3 s slack, with the count beside it and the two product values named. | REQ-64, REQ-65, REQ-66 | — |
| INT-3 | modify | the same file, the live-update case's poll | Budget from 40 s to 25 s: two sampling intervals, one list poll, 2 s slack, with the count beside it and the reason for the second interval. The polled value, the 1 s interval and every assertion around it stay exactly as written. | REQ-64, REQ-65, REQ-66, REQ-67 | — |
| INT-4 | modify | the same file, once for the whole file | Declare the per-test budget at 120 s, with the six parts of the count written beside it. One declaration for twelve tests, so the numbers cannot drift apart. | REQ-64, REQ-65 | INT-2, INT-3 |
| INT-5 | modify | `client/e2e/refresh-cache-immediacy.spec.ts`, its four cases | Each declares its budget: 90 s for the container, volume and network cases, 120 s for the compose one, with the count beside it. The 6 s the cases measure is untouched — it is the claim, not a budget. | REQ-64, REQ-65, REQ-67 | — |
| INT-6 | modify | `client/e2e/dialog-sizing.spec.ts` (the three filesystem-browser cases), `client/e2e/copy-affordance-geometry.spec.ts` and `client/e2e/copy-affordance-absence.spec.ts` (one case each) | Each declares 120 s, with the count beside it: the 60 s extraction the file already allows, plus what the case spends before and after it. | REQ-64, REQ-65 | — |
| INT-7 | modify | `client/e2e/local-persistence.spec.ts`, the analysis-cache case | Declares 120 s, with the count beside it: the 60 s extraction request `seedAnalysisCache` allows, plus the screen and the two cache readings. | REQ-64, REQ-65 | — |
| INT-8 | modify | `client/e2e/filesystem-browser.spec.ts`, the cancellation case | Declares 360 s, with the count beside it: the 300 s `docker build` its own helper allows, plus the rest. The largest budget in the suite, and it states what the file already permits itself. | REQ-64, REQ-65 | — |
| INT-9 | create | client workspace, beside the existing build checks | The guard: for each test, its budget (its own declaration, else the default read from the config) against every step budget in its reach — the test body and the helper functions of its own file. Fails on a step budget strictly greater, naming file, test and both numbers. | REQ-69, REQ-70 | INT-1 |
| INT-10 | modify | `client/package.json` | Chain the guard into `lint` and into `test`, beside the UI-boundary check. No skip, no marker. | REQ-71 | INT-9 |
| INT-11 | create | client unit check tree, beside the existing conformance-check checks | Drive the guard over sources written for it: a test whose step declares more than it has is refused; one whose steps fit is accepted; a config whose default cannot be read fails. The guard takes the tree to scan as an argument, so these sources live outside `client/e2e/` and no fixture spec is ever left where Playwright would run it. | REQ-72, REQ-69, REQ-70 | INT-9 |
| INT-12 | create | a new `check-budgets` module folder under `.sdd/modules/`, plus its row in `modules.md` | The rule and its guard, indexed together as `list-order` already is: one index row for the check, one spec stating the rule, what the guard refuses, what it deliberately does not catch, and the case admitted on the line. | — *(enabling)* | INT-9 |
| INT-13 | modify | the rest of `client/e2e/` | Run the guard over the whole tree and repair whatever it names beyond the seven files above, by the same rule. Planning found seven; this is what makes the claim exhaustive rather than trusted. | REQ-64, REQ-65 | INT-9 |
| INT-14 | modify | `client/e2e/containers-card-geometry.spec.ts`, the file's header comment | State where this file's budgets come from: the sampling cadence and the list poll the product declares, both certified decisions. And state that the cadence is never changed to make a check easier — the reader tempted by that is the reader of this file. | REQ-66, REQ-68 | INT-2, INT-3, INT-4 |

## The guard, and what it deliberately does not catch

**It refuses one thing: a declaration that is impossible on its face.** A step budget strictly greater
than its test's. That is what killed the run of 2026-08-31, and it is decidable from the source alone.

Three limits, written here and in the guard's own header so nobody trusts it further than it goes.

- **It does not add budgets up.** A test whose steps sum to more than it has still passes. Summing
  would mean deciding which worst cases can occur in one run, which the guard cannot know. It would
  refuse correct code, and a guard that refuses correct code is soon worked around rather than read.
  REQ-65's arithmetic, written beside each budget, is what a human reads instead.
- **It resolves helpers within one file, not across files.** Every violation the search found is a
  same-file helper. A budget declared in `client/e2e/support/` is not attributed to its callers, so
  the guard under-reports rather than reports wrongly — and the one budget that matters there,
  `openApp`'s 30 s, is admitted by the rule anyway.
- **It counts every numeric `timeout:` option, whatever API it belongs to.** A `docker build` allowed
  300 s is a patience the test must be able to spend, exactly as a locator's is. The guard does not
  try to tell one API from another, and does not need to.

**Why `strictly greater` and not `greater or equal`.** Equal is a lie too: a test cannot spend its
whole budget on one step and still do anything else. But `openApp` declares exactly the default, and
`>=` would refuse 562 tests at once for a helper this batch has decided not to touch. The rule is
uniform and has no special case; the borderline is recorded above instead of being hidden in an
allow-list.

**Why a guard at all, when seven files could simply be repaired.** The seven were written over
months, by people who could not see the 30-second ceiling because nobody had written it down. Repair
without the guard leaves the eighth to be found by a run that dies on a slow machine, which is how
this one was found.

## How the batch is certified

**The defect is reproduced deterministically, and not by re-running a flaky test.** Running the file
again proves nothing — it passed on other days. The reproduction is the guard: run it over the tree as
it stands today and it reports the 40-second poll inside the 30-second test, plus the other six files.
That satisfies [[an-intermittent-failure-is-reproduced-first]] in the only way a failure that depends
on luck allows.

Then: `npm run lint` and `npm run test -w client` are green, the guard included; and
`containers-card-geometry.spec.ts` is run with `--repeat-each=3`, all twelve cases green each time,
with no wait, retry or assertion changed in it.

## Human acceptance

**REQ-68 and REQ-72 have no scenario of their own.** REQ-68 is an absence — the check for it is
`git diff` over the two source trees. REQ-72 is a constraint on the guard's own check.

### Scenario: The check that died reports its own step instead of dying somewhere else

- REQ → REQ-64, REQ-66, REQ-67
- Given → the containers card checks, where waiting for a reading to change declared 40 seconds inside a test that had 30
- When → the human runs that file three times in a row
- Then → every case passes each time, and each waits for a stated number of sampling intervals rather than for a round figure

### Scenario: A budget larger than the test that runs it fails the build

- REQ → REQ-69, REQ-71
- Given → a repository where every check declares a budget it can spend
- When → the human writes a 40-second wait into a test with a 30-second budget and runs `npm run lint` in the client workspace
- Then → the build fails, naming the file, the test, and the two numbers

### Scenario: The count can be redone without reading the product

- REQ → REQ-65, REQ-70
- Given → the repaired files, and `client/playwright.config.ts` now stating the default budget
- When → the human opens any budget this batch wrote
- Then → beside it they find what the number is made of, and the default it has to fit inside is written in the configuration rather than assumed
