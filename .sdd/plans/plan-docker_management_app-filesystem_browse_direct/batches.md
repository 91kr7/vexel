---
slug: docker_management_app-filesystem_browse_direct
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-filesystem_browse_direct.md
requirements: .sdd/plans/plan-docker_management_app-filesystem_browse_direct/requirements.md
status: validated
---

# Batches — Browsing an image's filesystem starts where the decision is

Fix of the delivered product; bug-2. **One feature, one batch, eleven interventions: one changed
feature component, one read added to the server and its client access, six test points, one
documentation point.** Batch numbers and `REQ-n`/`INT-n` ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · filesystem-browse-direct | F1 — Choosing `Browse filesystem…` opens the filesystem, not an offer to open it | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32 | — | certified | **First, the report itself, with the mouse.** Images & layers → the `…` on an image never browsed before → `Browse filesystem…`: **the very next thing on screen is the cost warning**, naming the image and reading *"creates a container from the image (never started) and copies out about ***MB, taking roughly 5s"*. `Filesystem not extracted yet` and its `Browse filesystem…` button are **nowhere** — not at that moment and not at any later one. Confirm: progress, then `Completed`, then the dialog leaves by itself and the tree is there, `Freshly extracted` with its entry count. **Then the case the report never mentions.** Close the browser and choose `Browse filesystem…` on **the same image** again: **no cost warning, no progress dialog, at all** — watch for a second or two, nothing flashes past — and the tree is there marked `From cache` with its entry count. Then `Re-extract…` from inside it: the cost warning **is** back, because that path really does pay. **Then the ways out that screen used to be.** Decline the warning on a fresh image: nothing is left open, nothing extracted, the row action is still on the row. Start one and press `Cancel` on the progress dialog: back on the images list, no prompt offering to start it again, and `docker ps -a` shows no leftover intermediate container. Make one fail (remove the image from another terminal between the warning and the confirm): the failure states its cause, **stays** until dismissed, and dismissing leaves you on the images list rather than in an empty surface. **Then that nothing else moved**: the row menu's ten entries, their order and their labels are as they were; `Efficiency & signals…` still opens on its own `Not analyzed yet` screen — untouched on purpose, it is its own report; `Explore layers…` and `Compare with…` unchanged; and inside the browser the title, `Re-extract…`, `Download whole filesystem…`, the scaffolding note, the refused-entries note, search, the tree, the metadata/preview pane and per-file/per-folder download all still work. **Then the keyboard, on its own**: choose the entry with `Enter` from the menu — the cost warning receives the focus and `Escape`/`Tab` behave; on an already-extracted image the focus lands somewhere real inside the surface, never on nothing. **Then the two things this fix could silently break.** `.sdd/plans/.../batch-filesystem-browse-direct.md` INT-6 must show bug-1's cached-run check **living on `layer-efficiency-signals.spec.ts`** — a second `Analyze layer efficiency…` served from the shared changeset cache, reporting no phase, still reading `Completed` and still leaving on its own; if that check was deleted instead of moved, the batch is refused. And INT-1's shape-B test must prove reuse **without asking for an extraction** — the `From cache` marking, the entry count, and no request to the extraction stream during the open; "the tree appears" is not evidence and the batch is refused if that is what it settles for. **Then the evidence the checks could have caught it**: the implementer reports INT-1 to INT-6 **run against this build before INT-7 to INT-10 existed and observed failing**, naming what failed — in particular that shape A's absence assertion and shape B's sustained-absence assertion both go red on the delivered product. **Then the diff**: `git diff` is `FilesystemBrowser.tsx`, the image-analysis read and its client access, the test tree and `.sdd/modules/`; no raw markup or local style enters feature code, `check-ui-conformance.mjs` is unmodified and passes, no selector joins or leaves the blur allow-list, and nothing in `ImagesScreen.tsx`'s menu changed. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client`, `npm run test:typecheck -w server`, the touched server API file, and this batch's e2e specs each run on their own. The complete suites are the human's, at the end. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests the batch goes to `certified`.

Batch file:
[`batches/batch-filesystem-browse-direct.md`](batches/batch-filesystem-browse-direct.md).

## Assumptions and decisions

- **One batch, because this is one vertical slice.** The removal of the empty state and the two
  shapes that replace it are the same change to the same component: shape A exists only because the
  screen in front of it is gone, and shape B is what "no screen" means when a result is kept.
  Splitting them would produce a first batch that either strands the flow with no way to start an
  extraction or ships the cached case still warning about a cost it will not pay — the analysis's own
  first-named risk. Splitting the checks off from the fix would be splitting by layer, which is
  refused.
- **The decision is made by a read, and that read is added to the server** (INT-7). This is the one
  place the plan goes beyond the analysis's literal text and it is stated here rather than buried:
  the analysis's Out of scope names "anything the server does", while its own Established findings
  record that the answer lives on the server ("an in-memory index lookup keyed by image content,
  before creating anything and before touching the daemon … a question with an instant answer, not
  an operation") and its requirements demand that the reused view still state its source **and its
  entry count**. Today the only way to obtain either is `GET /filesystem/stream`, which is the
  extraction, and the only cache-existence signal the client can read is a `404` from
  `/filesystem/entries` — which carries no count. So the read is added, and it is a read in the
  strict sense: a cache lookup, no daemon call, no container, nothing written, absent when nothing
  is kept. The Out-of-scope line is read as governing the extraction operation (what it does, costs,
  creates, removes, keeps, and how it cancels), which this leaves untouched.
- **The browser surface opens behind the cost warning**, titled with the image. The analysis leaves
  the arrangement free ("may or may not be open behind"); this plan picks one, because the free
  choice has consequences it does not mention: the surface behind is where the actionless loading
  indication lives while the shape is being decided (REQ-6), it is what keeps the image's identity on
  screen for the whole flow (REQ-20), and it is what the delivered hosting checks in `images.spec.ts`
  assert against. What the analysis actually forbids is preserved in full: nothing behind the warning
  invites the request to be repeated, and declining closes both.
- **Nothing is added in the removed screen's place.** The surface behind the warning carries the
  title and, if a wait is perceivable, a spinner. No banner, no illustration, no "about this
  operation" note — a decorative replacement would restore the cost being removed while delivering
  less.
- **`Escape` on the filesystem view is re-pointed in `images.spec.ts`, not deleted.** That test is
  about the hosting rule — one of the four views open with nothing dismissed beneath it — and it used
  the filesystem view as its instance. With the cost warning on top, `Escape` now correctly answers
  the warning, so the instance moves to a view whose first surface is not a dialog
  (`Explore layers…`). The hosting contract keeps its coverage; what it loses is a redundant second
  instance of it, not a behaviour.
- **REQ-14 is checked where the decision lives, not through the daemon** — the steer taken at the
  requirements gate, and the same call the sibling plan made for its failure path. The window between
  "a result is kept" and "the result is read" is milliseconds wide; reaching it against a real daemon
  means a fixture whose only purpose is to have the cache cleared inside that window, which is flaky,
  slow, and would assert a client-side degradation through four layers of product. It is asserted at
  component level in `client/test/unit/filesystem-browser.test.tsx` (INT-2), with the read answering
  "kept" and the follow-up read answering "gone". Stated here rather than hidden.
- **The reuse contract is proved by three witnesses, one of them deterministic** (INT-1): the
  `From cache` marking with its entry count, the sustained absence of both dialogs, and **no request
  to the extraction stream at all during the open**. The third is what makes the check fail on a
  product that silently re-extracts at full cost — the failure mode the analysis says could otherwise
  go unnoticed for months — and it observes the product's own traffic rather than driving it, so the
  real-pointer rule is untouched.
- **bug-1's cached-run coverage has a named destination that exists**: `layer-efficiency-signals.spec.ts`.
  Verified rather than assumed — `layer-signals-service.ts` takes its progress solely from
  `computeImageChangesets`, which short-circuits on a cache hit, so a second `Analyze layer
  efficiency…` on the same image content reports **no phase at all** and still raises the dialog.
  That is bug-1's hardest case exactly, on a surface this fix does not touch.
- **`bugs.md` is left untouched**, as in the sibling plan: it is the human's own input file for a
  tranche of five reports being worked one at a time. The plan folder and the commits are the record.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the test rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing here contradicts the analysis. The two decisions taken beyond its text — the
server-side read (INT-7) and the surface opening behind the warning — are recorded above with their
reasons; both are settled by facts the analysis itself establishes, and neither widens the scope of
what the operator can do.

## Coverage check

Every REQ is served by at least one INT, and **every REQ closes inside batch 1** — there is one
batch, so nothing is split across batches.

| REQ | Interventions serving it |
| --- | --- |
| REQ-1 | INT-10 (verified by INT-1, INT-2) |
| REQ-2 | INT-10 (verified by INT-1) |
| REQ-3 | INT-10 (verified by INT-1) |
| REQ-4 | INT-7, INT-8, INT-9, INT-10 (verified by INT-1) |
| REQ-5 | INT-10 (verified by INT-1) |
| REQ-6 | INT-9, INT-10 (verified by INT-2) |
| REQ-7 | INT-10 (verified by INT-1) |
| REQ-8 | INT-10 (verified by INT-1) |
| REQ-9 | INT-10 (verified by INT-2) |
| REQ-10 | INT-10 (verified by INT-1) |
| REQ-11 | INT-10 (verified by INT-1, INT-4) |
| REQ-12 | INT-10 |
| REQ-13 | INT-7 (verified by INT-3) |
| REQ-14 | INT-9, INT-10 (verified by INT-2) |
| REQ-15 | INT-10 (verified by INT-1) |
| REQ-16 | INT-7, INT-8, INT-10 (verified by INT-3) |
| REQ-17 | INT-7 (verified by INT-3) |
| REQ-18 | INT-10 (verified by INT-1) |
| REQ-19 | INT-10 |
| REQ-20 | INT-7, INT-10 (verified by INT-1) |
| REQ-21 | INT-10 (verified by INT-2) |
| REQ-22 | INT-10 (verified by INT-5) |
| REQ-23 | INT-1 |
| REQ-24 | INT-1 |
| REQ-25 | INT-1 |
| REQ-26 | INT-1 |
| REQ-27 | INT-1, INT-4, INT-5, INT-6 |
| REQ-28 | INT-6 |
| REQ-29 | INT-1, INT-2, INT-4, INT-5 |
| REQ-30 | INT-1, INT-2 |
| REQ-31 | INT-1, INT-3, INT-4, INT-5, INT-6 |
| REQ-32 | INT-11 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, REQ-8, REQ-10, REQ-11, REQ-15, REQ-18, REQ-20, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-29, REQ-30, REQ-31 |
| INT-2 | REQ-1, REQ-6, REQ-9, REQ-14, REQ-21, REQ-29, REQ-30 |
| INT-3 | REQ-13, REQ-16, REQ-17, REQ-31 |
| INT-4 | REQ-11, REQ-27, REQ-29, REQ-31 |
| INT-5 | REQ-22, REQ-27, REQ-29, REQ-31 |
| INT-6 | REQ-27, REQ-28, REQ-31 |
| INT-7 | REQ-4, REQ-13, REQ-16, REQ-17, REQ-20 |
| INT-8 | REQ-4, REQ-16 |
| INT-9 | REQ-4, REQ-6, REQ-14 |
| INT-10 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-16, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 |
| INT-11 | REQ-32 |

**Three notes on the shape of that mapping**, all deliberate:

- **Six of the eleven interventions are checks, against one changed feature component.** That is the
  right proportion for this fix: the correction is a removal, and a removal is exactly the kind of
  change whose regressions — a warning that now lies on a cached open, a reuse contract quietly
  demoted, a sibling fix left certified by nothing — are only ever caught by verification. Two of the
  six (INT-4, INT-5) are not new coverage at all but delivered checks that would otherwise be
  deleted for driving a screen that no longer exists.
- **REQ-12 and REQ-19 are served by INT-10 as constraints, not as work.** They build nothing: they
  are how the diff is judged — one code path for the action so any future entry point inherits both
  shapes, and no raw markup or local style entering feature code. Same for REQ-22, which is a
  statement about what must *not* appear in the diff, verified by INT-5.
- **REQ-28 has exactly one intervention and it is a relocation, not an addition.** It is the one
  requirement whose failure is silent — the suite stays green while the sibling fix stops being
  verified — so it is an intervention with a named destination file and a named scenario, deliberately
  not a note attached to INT-1.

## Risks carried forward

- **The cached case fixed by making it warn** — the analysis's likeliest wrong reading, and the one
  the diff would look tidiest under. INT-1's shape B is the only thing standing between it and a
  green suite; its sustained absence must be a real wait across the window in which the dialogs would
  have appeared, not a single immediate assertion that passes because the dialogs have not been
  raised *yet*.
- **The shape decided after the work.** Starting the extraction stream and suppressing the surfaces
  when the answer comes back `fromCache: true` satisfies every visible assertion of shape B except
  the extraction-stream witness, and would leave the operator's second open still paying a round trip
  to an operation. REQ-16 is standalone for this reason, and INT-1's third witness is what fails it.
- **A loading state becomes the new empty state.** The surface behind the warning is one prop away
  from growing a heading and a button again. It carries a title and, at most, a spinner; INT-2 asserts
  that nothing in it is actionable while the shape is being decided.
- **The relocated check drifts into a weaker one.** Transplanted to `layer-efficiency-signals.spec.ts`,
  bug-1's cached run is only the hardest case if the second analysis genuinely reports no phase —
  which requires the view's client state to have been discarded between the two runs, exactly as the
  filesystem check did by closing the modal. A transplant that re-analyses without discarding proves
  much less.
- **Failure loses its way out.** The removed screen was the fallback for a failed extraction. INT-10
  re-homes it inside the failure report; if that report is dismissed onto an empty surface instead of
  onto the images list, the fix has replaced a redundant screen with a dead end.
