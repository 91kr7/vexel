---
slug: docker_management_app-privileged_toggle_verification
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-privileged_toggle_verification.md
requirements: .sdd/plans/plan-docker_management_app-privileged_toggle_verification/requirements.md
status: validated
---

# Batches — The privileged path under standing verification, and the investigation on record

Evolution of a certified product. **One feature, one batch, three interventions, and no fix.** Batch
numbers and `REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1`.

**This batch changes no product code.** It adds one e2e spec, one annotation line to `bugs.md` and
one cross-reference to a component spec. If a file under `client/src/` or `server/src/` is touched,
the premise of the whole item has failed (REQ-14) and the work stops rather than shipping.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · privileged-path-verification | F1 — The privileged path under standing verification, and the investigation on record | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25 | — | certified | **First, that nothing moved**: at a narrow window (~813px) open Containers → `Run container…`, toggle `Run privileged` — the sheet stays exactly as it was, every section still drawn, the toggle now on — then `Cancel`. The form, its wording, its layout, its sections and both commit actions are identical to before this batch, and `git status` shows **no file under `client/src/` or `server/src/` touched** and `client/test/unit/container-create-form.test.tsx` unmodified. **Then the check**: read `client/e2e/container-create-privileged.spec.ts` — its header names the record (`.sdd/analysis/docker_management_app-privileged_toggle_verification.md`), says in one line why the check is shaped around a *blank but present* sheet rather than around a successful create, and carries in its own words the sentence that this check **runs in one browser engine and therefore cannot clear bug-2**; if that sentence is absent the batch is not done. Run that spec on its own and watch it pass, including the **negative-control** test, which blanks the open sheet's content in the page and proves the content assertion **fails** on a surface that is present and empty — the symptom the screenshot depicts. **Then that the machine is as it was**: `docker ps -a --filter name=vexel-e2e-privileged` returns nothing, no new anonymous volume is on the daemon, and no privileged container was ever *started* — the check clicks `Create only`, never `Create and start`, and asserts `State.Running` is `false` alongside `HostConfig.Privileged` being `true`. **Then the record's reachability**: `bugs.md` carries **one appended annotation line under bug-2**, visibly an annotation, saying the item was investigated, did not reproduce, and where the record is — with the human's own text, typos included, **unaltered to the character**; and `.sdd/modules/containers/specs/container-create-form.md` carries the cross-reference naming the record, the check and the single-engine limit. The implementer reports having **read the record and confirmed** it carries the baseline result *with its control*, the crop measurement, the excluded and standing hypotheses, the measured/inferred/assumed distinction, the open thread and the cannot-clear sentence — and reports any of it missing rather than repairing it. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client` (the only pass that typechecks the e2e tree) and this batch's single e2e spec, run on its own. **The full unit suite and the complete e2e suite are not this batch's business**: they run once at the end, after all six items of `bugs.md` are certified — bug-2 is the **fifth of six**. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **No fix is planned, and no plausible hardening is smuggled in.** The failure does not reproduce on
  the current build or on the pre-work commit `3725389`, no cause is identified, and no line can be
  named as wrong. A change against an unidentified cause is unverifiable by construction — nobody
  could tell a successful fix from a no-op — and it would put an unverified edit into the one path in
  the product where an unnoticed regression carries host-level consequences. Nothing in this batch
  touches `client/src/containers/ContainerCreateForm.tsx`, the sheet it is drawn on, or the UI
  library.
- **The coverage is shaped around the symptom, and this is the decision the whole item turns on.** A
  check that asserted only "a privileged container was created" **would have passed during the very
  screenshot the human sent**: the surface was present, the application behind it was intact, and the
  investigation's own fourth attempt created a container successfully. Presence of a surface is not
  evidence of its content. So INT-1 asserts the sheet is **still drawing its own content** after the
  toggle — named landmarks plus the length of its rendered text — and INT-1's negative control proves
  that assertion can tell "present and drawn" from "present and blank".
- **The negative control replaces "seen red", and that is why it is permanent.** bug-1's check could
  be run against the unfixed build and observed failing; here there is no defect to fail against, so
  the only way to know the check detects anything is to construct the symptom and watch the assertion
  reject. Made a standing test rather than a one-time observation because a one-time demonstration
  decays silently the first time somebody simplifies the content assertion — which is exactly the
  failure this item exists to prevent. It costs one test that touches no daemon.
- **The content assertion is the sheet compared against itself, with exact equality and no tolerance
  band.** The sheet's rendered text length before the toggle must equal its length after — never a
  comparison against a literal. The investigation's 1154 characters is recorded as the observed value
  and is not the expectation: self-relative equality survives any future rewording, because a
  reworded form moves both sides together, while an absolute number would break on the next copy
  tweak and teach whoever fixes it to loosen the assertion. And no band, because **the band is where
  this check would quietly stop detecting the symptom** — the same argument that makes the negative
  control permanent. If the toggle is ever legitimately made to change the form's content (a warning
  when it is switched on, say), this check fails, and that failure is a review prompt rather than a
  defect in the check.
- **The container is created and never started. The started variant is refused outright.** The form
  offers `Cancel`, `Create only` and `Create and start`
  (`containers/specs/container-create-form.md`); the check uses `Create only`. Neither thing the
  check observes needs a running container: the sheet must keep drawing its content, and the daemon
  must hold the flag, which `HostConfig.Privileged` reports on a container that has never started.
  Actually running a privileged container hands the host's devices to a process on the operator's own
  machine to test a checkbox in a form — disproportionate, and what the project's test rules exist to
  refuse. **Accepted and stated consequence, alongside the single-engine one: the form's
  `Create and start` action is not covered by this work.** This is not a compromise to be revisited
  by a later implementer who notices the gap.
- **The fixture is the smallest one the suite has, and it is labelled through the form.**
  `vexel-test-tiny:1` (`TINY_IMAGE`, `server/test/support/base-images.ts`) is built `FROM scratch`
  by the preliminary step, fetched from nowhere, and is exactly "something a container can instantly
  be created out of" — which is all this check needs, since it never starts one. **The product
  creates the container, not the test, so the ownership labels cannot be passed on a CLI
  `docker create`**: they are entered through the form's own "Labels" section, `vexel.test.run` =
  `RUN_ID` and `vexel.test.case` = the case name, the same pair `ownershipArgs` stamps
  (`client/e2e/support/fixtures.ts:33-49`), so `npm run test:sweep -w server` can still remove a
  container left by a killed run. Removal is `docker rm -fv` in a `finally`. A `FROM scratch` image
  declaring no `VOLUME` cannot orphan an anonymous volume, so `-v` is belt and braces rather than the
  load-bearing part here — and it is still written, because the rule is the rule.
- **The two entry modes are the Containers toolbar and the image row, and the third is deliberately
  not a third.** `Run container…` and `Create from image…` are both on the Containers screen and open
  **the same component**, differing only in which commit action is primary
  (`containers/specs/containers-screen.md:65`); since this check clicks `Create only` in every case,
  that difference is exercised anyway, and the existing
  `client/e2e/container-create-run.spec.ts` already covers `Create from image…` for the ordinary
  create-only path. The genuinely different route is the image row's `Run…` on Images & layers, which
  mounts the form from another screen with `initialImage` pre-filled — that is the second entry mode,
  and it gets the full check, daemon assertion included. **It is also new ground rather than a
  re-run**: the human's investigation exercised `Run container…` and `Create from image…`, both on
  the containers screen, and never the image row. One of the two modes covered here has therefore
  never been attempted by hand, which is worth more than reproducing what was already tried.
- **A new spec file rather than extending `container-create-run.spec.ts`.** That file is
  `test.describe.configure({ mode: 'serial' })` and carries a `beforeAll` that prepares the run's
  pullable reference, because several of its tests share and delete one image — cost and coupling
  this check has no use for. It also could not carry INT-1's header honestly: REQ-22 asks for a
  statement about *this* check at the top of the file it governs. Same shape as bug-1, which got
  `client/e2e/dialog-sizing.spec.ts` of its own.
- **Not in `client/e2e/exclusive/`.** The check prunes nothing and removes nothing it did not create;
  it is scoped to its own fixtures and does not need the host to itself.
- **The narrow viewport is file-level, at the investigation's own width.**
  `test.use({ viewport: { width: 813, height: 800 } })`, so every test in the file runs narrow rather
  than one of them remembering to (REQ-7). 813px is the width the reproduction attempts used; the
  screenshot itself is a **crop** and cannot supply a real one, which the record states and which is
  why no width is claimed to be *the* reported one.
- **Uncaught failures become an assertion, which is new in this suite.** No spec in `client/e2e/`
  currently listens on `pageerror` or on console errors; INT-1 is the first. If the application emits
  benign console noise during the interaction, the exclusion is **narrowed to precisely that message
  with a comment saying why**, never widened into a filter that silences the assertion — the
  assertion is the automatic version of the human-watching-a-console finding the investigation
  produced, and a filtered version of it finds nothing.
- **The record is the analysis file, and no second account is written.** Decided by the human,
  against the alternative of a new `.sdd/records/` document: the analysis already carries the
  attempts, the baseline and its control, the crop measurement, the excluded and standing hypotheses,
  the measured/inferred/assumed distinction, the cannot-clear sentence and the open thread. A copy
  would have no owner, and the two would diverge the first time anyone learned something new, leaving
  the next investigator with two accounts of one investigation and no way to tell which is current.
  **This is not a departure**: the spec asks for the investigation to be preserved durably and never
  asks for a new file. What this batch adds is reachability — and, before writing a pointer to it, a
  confirmation that what is pointed at is complete (INT-3).
- **`bugs.md` is the human's file and is appended to, never edited.** One annotation line under
  bug-2, visibly an annotation, saying the item was investigated, did not reproduce, and where the
  record is. Not one character of their own text is altered, reflowed or reworded — the typos
  included — and the line carries no hypothesis and no conclusion: that is what the pointer leads to.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the test rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** No requirement contradicts the spec, and nothing delivered here was decided against it.
Three human decisions taken at the requirements gate are recorded above rather than as departures,
because each narrows towards the spec rather than away from it: the record's home (the spec's own
file, no copy), the permanent negative control (the spec's "verification must be permanent and
routine" applied to the check's own sensitivity), and create-only (the spec's "keep it short-lived,
minimal and labelled" taken to its end).

**One accepted gap is stated rather than departed from**, and it must survive into any later
summary: the check does not exercise `Create and start`, because this work refuses to run a
privileged container on the operator's daemon. It sits beside the single-engine limit as a stated
boundary of what was verified.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside batch 1 — there is one
batch, so nothing is split across batches.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-1 |
| REQ-2 | 1 | INT-1 |
| REQ-3 | 1 | INT-1 |
| REQ-4 | 1 | INT-1 |
| REQ-5 | 1 | INT-1 |
| REQ-6 | 1 | INT-1 |
| REQ-7 | 1 | INT-1 |
| REQ-8 | 1 | INT-1 |
| REQ-9 | 1 | INT-1 |
| REQ-10 | 1 | INT-1 |
| REQ-11 | 1 | INT-1 |
| REQ-12 | 1 | INT-1 |
| REQ-13 | 1 | INT-1 |
| REQ-14 | 1 | INT-1, INT-2, INT-3 |
| REQ-15 | 1 | INT-1 |
| REQ-16 | 1 | INT-1, INT-2, INT-3 |
| REQ-17 | 1 | INT-3 |
| REQ-18 | 1 | INT-3 |
| REQ-19 | 1 | INT-3 |
| REQ-20 | 1 | INT-3 |
| REQ-21 | 1 | INT-1, INT-3 |
| REQ-22 | 1 | INT-1, INT-3 |
| REQ-23 | 1 | INT-3 |
| REQ-24 | 1 | INT-3 |
| REQ-25 | 1 | INT-1, INT-2, INT-3 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-1 … REQ-15, REQ-16, REQ-21, REQ-22, REQ-25 |
| INT-2 | REQ-14, REQ-16, REQ-25 |
| INT-3 | REQ-14, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-25 |

**Four notes on the shape of that mapping**, all deliberate:

- **INT-1 carries almost everything, and that is what a coverage batch looks like.** Fifteen of the
  requirements describe one check: what it asserts, where it asserts it from, at what viewport, with
  what fixture, and what it leaves behind. Splitting them across interventions would be splitting one
  spec file by layer.
- **REQ-14 and REQ-15 are requirements this batch can only fail.** Nothing is built for them: they
  are kept true by all three interventions touching one new e2e file, `bugs.md` and one component
  spec, and no file of the product or of the existing unit tree. They are listed because "no
  behavioural change" is the premise of the entire item, and a batch that quietly edited the form
  would have invalidated it without anyone noticing at review time.
- **REQ-17 to REQ-21, REQ-23 and REQ-24 are confirmations, not writing tasks**, as the note under the
  requirements table says. INT-3 reads the record, confirms each of them, and only then writes a
  pointer at it. If one is missing it is **reported** — never repaired by a second account (REQ-16
  forbids it) and never by editing the analysis, which is not this plan's file.
- **REQ-25 is the only requirement served by all three interventions on purpose.** Reachability is
  the deliverable, and it is worth exactly as much as its worst route: the reader who starts at
  `bugs.md`, the one who starts at the component spec, and the one who starts at the check must all
  arrive at the same file.

## Risks carried forward

- **The check cannot clear bug-2 and will be cited as though it had.** One engine, no possibility of
  observing an engine-specific paint failure. Everything REQ-21 and REQ-22 do — the sentence in the
  record, in the header of the check and in the component spec — exists against this single risk, and
  it is a sentence, not a mechanism.
- **The content assertion can be weakened by a later editor** who finds it fussy and replaces it with
  "the sheet is visible". The negative control is the guard: weakening the assertion makes the
  control fail, so the two must be edited together and the header says why. That is as strong as this
  gets without a mechanism.
- **A blanked-sheet control is coupled to the sheet's DOM.** If `.ui-form-sheet` is restructured, the
  control needs adjusting — accepted, since the check is coupled to that surface regardless, and the
  alternative is no evidence that the check detects anything at all.
- **`Create and start` stays uncovered**, by decision. If the privileged path ever fails only on the
  start, this work will not see it.
- **The next unexplained report will again produce no evidence.** The product has no error boundary
  anywhere, so a render fault blanks the page silently and the operator has nothing to hand over but
  a photograph. Deliberately out of scope, opened as its own item, and recorded here as the standing
  risk it is.
