---
batch: checks-do-not-write-in-the-tree-they-read
feature: F5 — A check writes nothing inside the tree the other checks read
closed_req: REQ-73, REQ-74, REQ-75, REQ-76, REQ-77, REQ-78, REQ-79
depends: 4
---

# Batch — a check writes nothing inside the tree the other checks read

The requirements are in `../requirements.md` and are cited here by id.

**This batch changes no product source** (REQ-79). Nothing under `client/src/` or `server/src/` moves.
`client/scripts/check-ui-conformance.mjs` is edited, and it is a build check, not product: what it
refuses does not move by a millimetre (REQ-76).

## What is wrong with the checks

`npm run test -w client` failed on its **first** run and passed on the second:

```
ENOENT: no such file or directory … client/src/__conformance-fixture__/body-row-gap.css
in client/test/unit/no-unload-signalling.test.ts
```

`client/test/unit/ui-conformance-check.test.ts` drives the conformance script over bait sources. The
script scans `client/src` and takes no root (`clientRoot` from `import.meta.url`, `srcRoot =
join(clientRoot, 'src')`, lines 15-16), so the baits are written **into `client/src`**, in a
directory created per case and removed in `afterEach`. Vitest runs test files in parallel. Other
checks walk that same tree — list every file, then read each one — and between the listing and the
read the directory is gone.

`client/vitest.config.ts` says in its own header that the tests live outside `client/src` *"so the
UI-boundary conformance check never scans test code"*. The bait directory is the one thing that
crosses that line, in the other direction.

## The census, verified in the tree

Seventeen unit checks touch `client/src`. **Nine scans, in nine files, list then read without
skipping the bait directory** — these are the ones that can fail:

| file | the scan | root |
|---|---|---|
| `no-unload-signalling.test.ts:30` | the one that failed | `src` |
| `card-list-deleted.test.ts:28` | | `src`, `scripts` |
| `card-row-presentation-retired.test.ts:56` | | `src`, `scripts` |
| `copy-affordance-absence.test.ts:59` | | `src` |
| `empty-state-action-names.test.ts:50` | excludes `src/ui` **after** listing, not the bait directory | `src` |
| `filesystem-browser.test.tsx:167` | | `src` |
| `library-layer-adoption-perimeter.test.ts:54` | | `src` |
| `modal-composed-title.test.tsx:135` | | `src` |
| `modal-close-control.test.tsx:144` | **the second scan of a file counted among the defenders** | `src` |

**Eight defend themselves by skipping the directory by name** — `blur-policy:69`,
`overlay-glass:49`, `data-table-column-minimums:229`, `modal-close-control:269`,
`programme-constraints:163`, `property-columns-contract:326`, `property-columns-retirement:32`,
`truncation-contract:47` **and** `:65` (two walkers in one file, one skip each) — plus
`ui-conformance-check.test.ts`, which owns the directory.

**Two files that look exposed are not**: `dialog-one-form.test.tsx` and
`section-header-one-treatment.test.tsx` walk `client/src/ui/` only, which the bait directory is not
inside. That is the correction to the grep-based count.

**The defence is per scan, not per file, and it has already decayed twice.**
`modal-close-control.test.tsx` defends one of its two scans and leaves the other open;
`programme-constraints.test.ts:150` still describes itself as one of *"the three other scans"* when
there are eight. A cure that has to be copied is a cure that will be forgotten.

## The road taken, and the three refused

**Taken — the bait directory leaves the scanned tree** (road 1). The script takes the tree to scan as
an argument and defaults to `client/src`; its check writes its baits in a throwaway root outside both
source trees and hands that root to the script. The cause dies: nothing is ever created inside a
scanned tree, so the eight defences become **useless rather than wrong**, and the nine exposed scans
stop being exposed without being touched. It is also the form batch 4 already chose for its own guard
(*"the guard takes the tree to scan as an argument"*, INT-11), so the two checks of this plan are
invoked the same way. It is not a new idea in this file either: the containers-admission cases
already run the script over a tree of their own — by **copying the script** into
`client/.card-row-sandbox`, which is why that sandbox has to sit inside the workspace (the script
imports `typescript`, which a copy in the OS temp directory could not resolve). With a root argument
the copy is unnecessary and both mechanisms collapse into one.

- **Refused — one shared walker in the tests' support tree** (road 2). It removes the repetition, not
  the cause: the directory stays inside `client/src`, and the first scan written without the shared
  walker falls into the same hole. It also costs a refactor of seventeen checks to protect against
  something the chosen road makes impossible.
- **Refused — add the skip to the nine scans that lack it** (road 3). The smallest change and the
  most fragile: it is the ninth copy of the wrong cure, and the two decayed instances above are what
  the tenth will look like.
- **Refused — stop the two from running together** (road 4). Serialising the unit suite, or pinning
  the conformance check to its own worker, costs time on every run for ever and still leaves a test
  writing inside the sources — the rule `CLAUDE.md` opens its testing section with.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/scripts/check-ui-conformance.mjs`, its three root declarations (lines 15-17) | The tree to scan becomes the first argument; with none, `client/src` resolved from the script's own location, as today. `clientRoot` **keeps its name** and becomes the given tree's parent, so the reported paths, the UI-library sub-tree and the `client/…` form the card-row admission matches all follow the tree given. | REQ-74, REQ-75, REQ-76 | — |
| INT-2 | modify | `client/test/unit/ui-conformance-check.test.ts`, its two writing mechanisms | The baits move out of `client/src`: one throwaway root per case under the OS temp directory, handed to the script as its scan root. The bait directory and the `.card-row-sandbox` copy of the script become that one mechanism. Every case keeps its bait, its assertion and the message it matches. | REQ-73, REQ-76 | INT-1 |
| INT-3 | modify | the same file | The case that fails on today's code: with a case's baits written, `client/src` holds no `__conformance-fixture__`, and neither source tree holds anything the run created. | REQ-73 | INT-2 |
| INT-4 | modify | the eight scans that skip the bait directory by name (`blur-policy`, `overlay-glass`, `data-table-column-minimums`, `modal-close-control`, `programme-constraints`, `property-columns-contract`, `property-columns-retirement`, `truncation-contract`) | Remove the skip and the comment justifying it. Nothing else in those files changes: no read is wrapped, no scan is retried, and each covers exactly the files it covered. | REQ-77, REQ-78 | INT-2 |
| INT-5 | modify | `client/test/unit/programme-constraints.test.ts`, the hunk rule over the conformance script | Admit one further term — the scanned root — with the date and the reason, exactly as batch 1 admitted the card row. See the note below: without this, the run after the commit fails. | REQ-74 | INT-1 |
| INT-6 | modify | the headers of `client/scripts/check-ui-conformance.mjs` and of its check | Say it once where it will be read: the tree to scan is an argument, a check's baits never go inside a scanned tree, a listed file is read with no catch around it, and no product source is touched to make a check calmer. | REQ-73, REQ-78, REQ-79 | INT-2 |
| INT-7 | modify | `.sdd/modules/ui-library/specs/ui-conformance-check.md` | The contract gains the scanned root and its default; what the check refuses does not move. | — *(enabling)* | INT-1 |

## The certified check this batch has to walk past

`programme-constraints.test.ts` pins the conformance script twice, for
`plan-ui-coherence-optimisation/REQ-84` and `.../classic-table/REQ-34`. Both were read before this
batch was written, and they are the reason INT-1 is as small as it is.

- **The blur half, byte-identical, at every revision that has touched the file.** Six declarations by
  name, `checkBlurPolicy` among them — and `checkBlurPolicy` reads `clientRoot` (line 175). Renaming
  that variable would break the pin at every revision it compares. **So it is not renamed**: it is
  given a different value. INT-1 edits none of the six, and the pin passes untouched — which is the
  strongest available proof that the blur policy did not move (REQ-76).
- **The hunk rule**: every hunk of every revision touching the script since the blur half settled must
  mention the card row or the retired list component's budget. INT-1's hunk mentions neither, so the
  check fails **on the run after the commit**, not before it — the surprise INT-5 exists to prevent.
  Batch 1 of this plan widened that same rule by one named term and recorded it; INT-5 does the same,
  and weakens nothing: the byte-identity above is what protects the blur half, and it still holds.

## How the defect is made observable, deterministically

A green run proves nothing here — the failing suite passed on its second attempt. Three observations,
and they answer different questions.

**1. The cause, with no timing at all.** INT-3's assertion is written **first** and run against
today's code: with the baits written, `client/src/__conformance-fixture__` exists, and the case fails
on every run, not one in five. It is the same line that ships, so the red and the green are the same
assertion. This is the check that would have caught the defect the day it was written.

**2. The consequence — the exact ENOENT — forced without concurrency.** The race ends with a path
that a listing returned and a read cannot open. That state can be held still: plant an entry that is
listed and unreadable.

```
mkdir -p client/src/__conformance-fixture__
ln -s no-such-target client/src/__conformance-fixture__/body-row-gap.css
npm run test:unit -w client        # not `npm run test`: lint walks the same tree first and would stop the run
rm -rf client/src/__conformance-fixture__
```

`readdirSync(…, { withFileTypes: true })` returns the link — not a directory, name ending in `.css` —
and `readFileSync` throws the identical `ENOENT: no such file or directory`. What the run must show:
**the nine scans of the census fail with that error, and no others**; the eight defended scans pass,
and so do `dialog-one-form` and `section-header-one-treatment`. That turns the census above from a
reading of the source into a measurement, and it is what the implementer reports.

**This probe is evidence, not a check to keep.** After the fix nothing skips that directory by name,
so the same planted link still fails those nine scans — correctly: an unreadable file inside the
scanned tree is a broken tree, and no check is asked to tolerate one (REQ-78). What the fix removes
is the only thing that ever created one.

**3. That the class is closed.** With the fix in, run the client unit suite and watch the tree:
`git status --porcelain -- client/src server/src` stays empty **while** it runs, and
`client/src/__conformance-fixture__` never appears. On today's code a 0.1 s watch loop sees it within
seconds; after the fix there is nothing to see at any instant. This one is timing-dependent in the
safe direction — it can only under-report on the old code.

Nothing in the batch serialises the suite: vitest keeps running its files in parallel, which is the
concurrency that made the failure possible and which the fix does not need removed.

## How the batch is certified

- The probe of observation 2 is run **before** the repair, and its list of failing files is reported
  ([[an-intermittent-failure-is-reproduced-first]], in the only form a race allows). The tree is left
  clean afterwards.
- INT-3's assertion is red before the repair and green after it.
- `npm run lint`, `npm run test -w client` and `npm run test -w server` are green, `npm run test -w
  client` run **three times in a row from cold** — the failure was a first-run failure.
- `git diff` over `client/src/` and `server/src/` is empty and stated in the report (REQ-79,
  [[a-neutralisation-is-undone-before-delivery]]).
- The conformance script's own check runs the same cases it ran before, with the same expected
  messages: the diff of `ui-conformance-check.test.ts` shows relocated baits, not fewer of them.

## Human acceptance

**REQ-75, REQ-78 and REQ-79 have no scenario of their own.** REQ-75 is the mechanism scenario 2
verifies; REQ-78 and REQ-79 are absences, checked by `git diff` over the two source trees and by a
search for a `catch` around a scan's read.

### Scenario: Nothing appears inside the sources while the checks run

- REQ → REQ-73, REQ-77
- Given → a repository where the conformance check's baits live outside the source trees
- When → the human runs `npm run test -w client` and, while it runs, watches `client/src` and
  `git status --porcelain -- client/src server/src`
- Then → no `__conformance-fixture__` ever appears, both trees stay exactly as git has them, and the
  suite is green — three consecutive times from cold, first runs included

### Scenario: The guard still refuses exactly what it refused

- REQ → REQ-74, REQ-76
- Given → the conformance script, now taking the tree to scan as an argument
- When → the human runs `npm run lint`, then puts back one violation at a time: a raw `<div>` in a
  feature file, a `backdrop-filter` on a selector that is not allow-listed, one `<Card>` per row in
  another screen, and the same `<Card>` per row in `ContainerCard.tsx`
- Then → the first three fail with the wording they failed with before, naming `src/…` paths as
  before; the fourth passes, because it is one of the two admitted paths; and the script run with no
  argument still scans `client/src`

### Scenario: No scan has to remember a directory that cannot exist

- REQ → REQ-77
- Given → the repaired checks
- When → the human searches `client/test/unit/` for `__conformance-fixture__`
- Then → only the check that owns the baits names it, and only inside its own throwaway root; no scan
  skips a directory by name, and the suite is green with every scan reading the same files it read
  before
