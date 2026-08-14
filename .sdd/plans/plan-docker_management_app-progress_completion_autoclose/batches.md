---
slug: docker_management_app-progress_completion_autoclose
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-progress_completion_autoclose.md
requirements: .sdd/plans/plan-docker_management_app-progress_completion_autoclose/requirements.md
status: validated
---

# Batches — The shared progress dialog says it has finished, then leaves

Fix of the delivered product; bug-1. **One feature, one batch, nine interventions, one changed
component of product code plus a one-prop edit on four consumers.** Batch numbers and `REQ-n`/`INT-n`
ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · progress-completion-autoclose | F1 — The shared progress dialog states completion and dismisses itself | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26 | — | certified | **First, the report itself, by hand and with the mouse.** Images → an image → `Browse filesystem` → confirm the cost warning, then **touch nothing**: at the end the caption reads `Completed` with the bar full, `Close` is offered, and about a second later the dialog is gone on its own and the extracted tree is there behind it. **Browse the same image again** — the run the human reported, served from cache: it reads `Completed`, never `Starting…`, and it still leaves by itself. Then the same three beats on the other three analyses: `Analyze layer efficiency`, the layer explorer's `Analyzing layer changesets`, and `Comparing filesystems` — and on the fresh runs check the final phase wording (`Indexing the filesystem…`, `Exporting the image…`, `N of M layers analyzed`) is **replaced** by `Completed`, not joined by it. **Then the two that must not leave**: `Load image…` from a tarball and `Import filesystem…` both reach `Completed`, and are **still on screen a minute later** with the created image references readable, dismissed only by `Close`. **Then the three ways this fix could ship a worse defect**: make one analysis fail (an image removed under it, or the daemon stopped) — the failure and its cause are shown and the dialog **stays**; press `Close` yourself at the instant the caption turns `Completed` — exactly one close, no error, nothing reopens; and re-run the same analysis **inside** that second — the dialog that was just opened is not closed by the previous one's timer. `Cancel` mid-run still closes immediately as it does today. **Then that nothing else changed**: on all six dialogs the title, description, size, in-flight wording, bar and controls look exactly as they did — the completed caption and the disappearance are the only differences — and a screen reader announces the completion when it happens without the focus jumping. **Then the evidence the checks could have caught it**: the implementer reports INT-1 to INT-5 **run against this build before INT-6 existed and observed failing**, naming what failed. **Then the diff**: `git diff` is `TransferProgressDialog.tsx` (plus at most its own stylesheet), one prop added at four call sites, the test tree, and `.sdd/modules/`; no feature file grows a timer or a caption, `check-ui-conformance.mjs` is unmodified and passes, and no selector joins or leaves the blur allow-list. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client`, and this batch's e2e specs each run on their own. The complete suites are the human's, at the end. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests the batch goes to `certified`.

Batch file:
[`batches/batch-progress-completion-autoclose.md`](batches/batch-progress-completion-autoclose.md).

## Assumptions and decisions

- **One batch, because this is one vertical slice.** The completed caption and the self-dismissal are
  not separable deliverables: the second is counted from the moment the caption becomes visible, and
  both land on the same component, `client/src/ui/feedback/TransferProgressDialog.tsx`. Splitting them
  would produce a first batch that closes no observable defect on its own and a second that re-opens
  the same file. Splitting the checks off from the fix would be splitting by layer, which is refused.
- **The shared surface is `TransferProgressDialog`**, established from the ui-library index and its
  spec: `status: 'active' | 'done' | 'error'`, `Cancel` while active and `Close` once ended — which is
  what the report describes when it observes that `Close` is itself the proof the work has finished.
  Its six consumers are `FilesystemBrowser.tsx`, `LayerEfficiencyView.tsx`, `LayerExplorer.tsx`,
  `ImageDiffView.tsx` and **two** call sites in `ImagesScreen.tsx` (`Loading tarball`, `Importing
  filesystem tarball`), all under `client/src/images/`. The defect is visible in the component's own
  source: at `status === 'done'` the bar is forced to `100` while the caption keeps whatever
  `formatCaption` — the screen's in-flight phase wording — returns.
- **The auto-close is an explicit opt-in prop, defaulting to off.** The four analyses pass it; the two
  tarball transfers do not. The alternative — auto-close by default with an opt-out — would mean any
  future consumer that forgets the opt-out silently destroys whatever its dialog is the only place to
  read, which is the analysis's own second-worst outcome. The safe default is the one where the
  mistake is a dialog that waits, not a dialog that vanishes with a result in it.
- **The timer lives in the library, never in a consumer** (REQ-4, REQ-15). Consumers are re-pointed
  with one prop and are not re-implemented; none of them acquires a timeout, a completion caption or a
  completion state. A screen-level version of this is the second definition whose absence is the whole
  reason the defect appeared on two dialogs at once.
- **The failure path and the timing invariants are checked at the library level, not dressed up as an
  e2e** — decided under the orchestrator's steer at the requirements gate. Reaching a *real* daemon
  failure inside these four analyses means inventing a fixture whose only purpose is to fail (an image
  removed underneath a running extraction, a daemon stopped mid-run): flaky, slow, and it would be
  asserting on the library's exclusion rule through four layers of product. The exclusion is a
  property of the shared surface, so it is asserted on the shared surface, with fake timers, in
  `client/test/unit/` — stated here rather than hidden, per REQ-20. The **happy sequence over time**
  stays in e2e on the real product path with a real pointer, where it belongs.
- **The seen-red evidence comes free with the racing checks.** The five delivered e2e specs that press
  `Close` are rewritten to wait for the dialog to leave on its own (REQ-24); against the unfixed build
  that wait times out, and the caption assertion reads the phase wording instead of `Completed`. So
  REQ-23 is discharged by running INT-1 to INT-5 before INT-6 exists, and reporting what failed. No
  permanent negative control is added: there is a real defect to fail against.
- **`image-transport.spec.ts` keeps its `Close` presses**, and gains an assertion that the dialog is
  *still there* after the auto-close window (REQ-21). That spec is the only place the exclusion of the
  two result-carrying dialogs can fail visibly, and its existing presses are correct behaviour, not a
  race.
- **The cached run is covered where the cache is already the subject** — `filesystem-browser.spec.ts`
  already contracts "reuses the cached extraction the next time the image is browsed", and that is the
  exact run in the human's screenshot (REQ-22). Nothing about the cache changes: `VEXEL_DATA_DIR` is
  emptied before every test, so the second browse within one test is the cached one.
- **`bugs.md` is left untouched** (confirmed by the orchestrator at the requirements gate). It is the
  human's own input file for a tranche of five reports being worked one at a time; annotating it while
  it is still being consumed would edit the brief mid-tranche. The plan folder and the commits are the
  record.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the test rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing here contradicts the analysis. The two decisions taken beyond it — the opt-in
default for the auto-close prop, and keeping the failure/timing invariants at the library level —
both narrow towards the analysis's stated risks rather than away from them.

## Coverage check

Every REQ is served by at least one INT, and **every REQ closes inside batch 1** — there is one
batch, so nothing is split across batches.

| REQ | Interventions serving it |
| --- | --- |
| REQ-1 | INT-6 (verified by INT-1, INT-2, INT-3) |
| REQ-2 | INT-6 (verified by INT-1, INT-2 on the cached run) |
| REQ-3 | INT-6 (verified by INT-1) |
| REQ-4 | INT-6, INT-7 |
| REQ-5 | INT-6, INT-7 |
| REQ-6 | INT-6 (verified by INT-1, INT-2, INT-3) |
| REQ-7 | INT-6 |
| REQ-8 | INT-6 (verified by INT-1) |
| REQ-9 | INT-6 (verified by INT-1) |
| REQ-10 | INT-6 (verified by INT-1) |
| REQ-11 | INT-6 (verified by INT-1) |
| REQ-12 | INT-7 (verified by INT-5) |
| REQ-13 | INT-6 (verified by INT-2) |
| REQ-14 | INT-6 (verified by INT-1) |
| REQ-15 | INT-6, INT-7 |
| REQ-16 | INT-6, INT-7 |
| REQ-17 | INT-7 (verified by INT-2) |
| REQ-18 | INT-2, INT-3 |
| REQ-19 | INT-2, INT-3, INT-5 |
| REQ-20 | INT-1 |
| REQ-21 | INT-5 |
| REQ-22 | INT-2 |
| REQ-23 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6 |
| REQ-24 | INT-2, INT-3, INT-4, INT-5, INT-8 |
| REQ-25 | INT-2, INT-3, INT-4, INT-5 |
| REQ-26 | INT-9 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-1, REQ-2, REQ-3, REQ-8, REQ-9, REQ-10, REQ-11, REQ-14, REQ-20, REQ-23 |
| INT-2 | REQ-13, REQ-18, REQ-19, REQ-22, REQ-23, REQ-24, REQ-25 |
| INT-3 | REQ-18, REQ-19, REQ-23, REQ-24, REQ-25 |
| INT-4 | REQ-23, REQ-24, REQ-25 |
| INT-5 | REQ-12, REQ-19, REQ-21, REQ-23, REQ-24, REQ-25 |
| INT-6 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13, REQ-14, REQ-15, REQ-16, REQ-23 |
| INT-7 | REQ-4, REQ-5, REQ-12, REQ-15, REQ-16, REQ-17 |
| INT-8 | REQ-24 |
| INT-9 | REQ-26 |

**Three notes on the shape of that mapping**, all deliberate:

- **Five of the nine interventions are checks, against one changed component.** That is the right
  proportion here: the correction itself is small and local, while what the analysis calls the single
  worst available outcome — an auto-close that swallows a failure or a result — is only ever caught by
  verification. This project has already certified one defect behind a check that could not fail.
- **REQ-20 is served by exactly one intervention, and that one is not an e2e.** Declared above with
  its reason, so that a later reader does not mistake it for coverage that was quietly dropped.
- **Several REQs are served by INT-6 "as confirmations, not as work"** — REQ-16 (nothing else about
  the dialog changes) and REQ-17 (nothing on the daemon side changes) build nothing. They are how the
  change is judged, which is what makes a small diff reviewable.

## Risks carried forward

- **The timer outliving its dialog** is the most likely regression of this fix, and the hardest to see
  by hand: it fires on a dialog the operator has just deliberately opened. It is covered in INT-1
  (arm, disarm on unmount, on manual close, on a re-open inside the window) and in the human
  acceptance, and it is the one place where "it looked fine" is not evidence.
- **The e2e specs get slower and, worse, quieter.** Waiting for a dialog to disappear on its own is a
  timeout away from a check that passes for the wrong reason. Every rewritten wait asserts the
  `Completed` caption *while the dialog is present* first — the assertion that cannot be satisfied by
  the dialog never having appeared.
- **A sixth consumer added later forgets to opt in.** The default is deliberately the safe direction,
  so the failure mode is a dialog that waits for a hand — the delivered behaviour, not a new defect.
  INT-9 records why the default is what it is, since the next reader's instinct will be to flip it.
