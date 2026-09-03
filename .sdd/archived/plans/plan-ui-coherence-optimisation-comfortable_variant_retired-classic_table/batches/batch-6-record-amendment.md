---
batch: 6
feature: The written record stops mandating what the product no longer has — the reference plan amended in the open, the certified record annotated, the specs swept
closed_req: [REQ-25, REQ-26, REQ-27, REQ-37, REQ-38]
depends: [5]
---

# Batch 6 — The record

Requirements: [`../requirements.md`](../requirements.md). Ids are local to this plan.

**What this batch is for.** `plan-ui-coherence-optimisation` is finished and merged, which means a
later reader takes its requirements as settled. Three of them currently **require** the presentation
this programme has just removed. Left standing, they are not stale prose: they are the authority
under which someone reinstates the variant and is, by the record, correct to do so. That is the
failure this whole plan is the second attempt at, one level up from the code.

**Two treatments, and the difference between them is the whole batch.** A **normative** artefact —
one that still governs what a later reader believes — is **amended in place**, carrying its reason,
its date and a pointer to this analysis. A **historical** artefact — the record of what a certified
batch actually built — is **annotated**, never rewritten: editing an intervention's text to agree
with today destroys the evidence of what was built and why, which is the same reason the analysis
this plan came from was not itself rewritten.

**Everything below is re-verified against the source before it is edited.** The enumeration comes
from an analysis written on 2026-08-15 against a mid-flight branch; the line numbers here were
re-checked on 2026-08-16 and are given as a starting point, not as a substitute for looking.

**And the enumeration was found short, which is the expected outcome and not a defect.**
`batch-4-truncation-contract.md` names the retired presentation three times and was **not** in
`INT-3`'s original list, so the batch's own verification grep could not have come back clean; it was
annotated under the same treatment and the list above now reads ten files. The list was written a day
before the retirement existed, and **REQ-25 already requires anything it missed to be amended** —
which is exactly the mechanism working. It is the **third** enumeration in this plan to be found
incomplete (batch 1's locator list, batch 2's, and this), and the lesson is recorded in the plan's
risks: *an enumeration made before the change exists is a starting point, never a perimeter.*

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `.sdd/plans/plan-ui-coherence-optimisation/requirements.md` — REQ-22 (:140), REQ-29 (:147), REQ-81 (:281), and the narrative statement at :80 | **Amend in place, each with its reason, its date (2026-08-16) and a pointer to this plan and its analysis.** REQ-22 requires one object-list primitive with **one** presentation; the two-variant clause and the "both variants are available to any screen" clause go. REQ-29's coverage clause loses the half obliging coverage of a presentation that no longer exists. REQ-81's parenthesis — one way an object is listed, *in two variants* — goes; the counts it states are unaffected and stand. The narrative at :80, which records that the object list was delivered *by* that variant, is amended to say what was delivered and that the variant was retired afterwards. **No requirement is renumbered, deleted or added**, following that plan's own precedent. | REQ-25 | — |
| INT-2 | modify | `.sdd/plans/plan-ui-coherence-optimisation/batches.md` (:75, :141) | The same treatment for the plan narrative that names the retired presentation as the destination of the migrations. Same reason, same date, same pointer, one level up. | REQ-25 | — |
| INT-3 | modify | `.sdd/plans/plan-ui-coherence-optimisation/batches/batch-4-truncation-contract.md` (:26), `batch-5-library-layer.md` (:38, :46), `batch-6-volumes-networks.md` (:21), `batch-7-registries.md` (:22), `batch-8-builders-build-cache.md` (:19), `batch-9-contexts.md` (:24), `batch-10-plugins.md` (:19), `batch-11-compose.md` (:99), `batch-12-swarm.md` (:26), `batch-13-images-layers.md` (:32) — **ten files; `batch-4-truncation-contract.md` was added 2026-08-16, this enumeration having been written a day before the retirement existed** | **Annotate, do not rewrite.** One dated note per file, in the form those files already use for their own corrections, recording that the presentation their interventions introduced or adopted was retired on 2026-08-16, that their acceptance figures were measured against it, and where the decision is written. The interventions' own text, their REQ citations and their acceptance text stay exactly as delivered — including batch 13's INT-7, which is now a record of work done rather than an instruction, and is therefore annotated like the rest rather than retargeted as the 2026-08-15 analysis proposed for a batch that had not yet run. | REQ-26 | — |
| INT-4 | modify | `.sdd/modules/` — every index and spec still describing two presentations after batches 1–5 have corrected their own | **The sweep that closes REQ-27.** Re-verify the whole tree against the source rather than against the analysis's figure of "37 statements across 17 files": search `.sdd/modules/` for the retired presentation by name and by class, and correct whatever the earlier batches did not — a screen or panel spec still naming a card row, an index whose one-line responsibility still advertises two variants, a spec describing the row-content slot as available "in one variant only". Specs are corrected, not annotated. The outcome is stated as a count: files searched, statements found, statements corrected, and zero left. | REQ-27 | — |

## Constraints on this batch's diff

- **Nothing outside `.sdd/` changes.** No source file, no test, no script, no server file (REQ-37).
- **This batch touches no file any test's *assertions depend on*** — which is the load-bearing claim,
  and it is stated in that form because the stronger one is false. *(Corrected 2026-08-16, found by
  this batch's developer.)* The batch previously claimed it touched "no file any test reads". **Three
  unit files do read `.sdd/modules/ui-library/`**: `blur-policy.test.ts:132` (`readdirSync` over the
  whole `specs/` directory), `copy-affordance-absence.test.ts:166,171` (`index.md`) and
  `property-columns-retirement.test.tsx:97` (`content-columns.md`) — and `INT-4` mandates a sweep over
  exactly that directory, `data-table.md` included, so the old claim was disprovable in one grep from
  the day it was written. What holds is the narrower statement: those three read that directory for
  **the blur allow-list, the copy affordance and the content-columns contract**, none of which this
  batch's edits touch — the retired presentation's vocabulary appears in none of their assertions.
  **Established by measurement, not by argument**: the three files are run immediately after the
  sweep's edits (3 files, 39 tests, 762ms, all passing) and again inside the closing complete run. A
  future reader who greps and finds those three readers is looking at a case this plan has already
  accounted for, not at carelessness.
- **The analysis files are not edited.** `.sdd/analysis/ui-coherence-optimisation.md` and the two
  that followed it are dated records; the two corrections this plan makes to the most recent one's
  enumeration are recorded in this plan's `batches.md` under *Departures*, where a reader comparing
  the two finds them explained.
- **`bugs.md` and the human's own input files are not touched.**
- English only in every amended artefact; kebab-case for any new file (REQ-38).

## Verification for this batch

- Re-read each amended requirement as a stranger would: does it now describe the product that ships,
  and does it say when it was amended, why, and where the decision is written?
- `grep` the whole of `.sdd/modules/` for the retired presentation's name and classes: nothing.
- `grep` `.sdd/plans/plan-ui-coherence-optimisation/` for it: only inside the dated notes of `INT-3`
  and inside the interventions those notes are attached to — which are the historical record and are
  supposed to still name it.
- `git diff --stat` confined to `.sdd/`.

## The programme's closing step

After this batch, and only then: **the complete client unit run and the complete e2e run, once, in
full** — `npm run test -w client` and `npm run test:e2e -w client`, including the exclusive project.

This is **the only place in the whole programme where a full suite runs**. Every batch before this
one ran its own named unit files and its own named e2e specs and nothing else; if one of them ran a
complete suite, the rule was broken whatever it found. And **this batch is not certified until both
runs are green** — the record being amended is not the deliverable on its own, it is the last thing
that happens before the programme is closed.

This batch changes no assertion's subject — see the constraint above, and the measurement behind it —
so a failure in those runs belongs to batches 1–5, or to the tree this plan started from, and is
attributed to whichever owns the surface that failed.

**These runs start from a tree with no known reds, and that is arranged rather than hoped for.**
Batch 4 clears every failure that would otherwise land here, and the class is **enumerated** there
rather than hoped about: `library-layer-screens-unmoved.spec.ts` (superseded by this plan) and
`dialog-one-form.spec.ts` (pinning a converted row to the delivered card's height), both under
`b4/INT-6`; `compose-row-geometry.spec.ts`, a fixture race that **predates the plan entirely** and
reproduces at `d17e1df` (`b4/INT-7`); and the locator sweeps of batches 1 to 3, restated in the
batches that met them. Batch 6 is therefore never asked to absorb a red it did not cause. A failure
in these runs therefore belongs to batches 1–5 and is attributed to whichever one owns the surface
that failed.

**Three specs are exercised here for the first time or for the first time since being repaired**, all
expected green rather than discovered: `client/e2e/exclusive/volumes-prune.spec.ts`, restated in
batch 1 for the locator change REQ-40 forced but never run, the exclusive project being outside every
batch's own set; `client/e2e/library-layer-screens-unmoved.spec.ts`, red by design from batch 1 and
settled by `b4/INT-6`; and `client/test/unit/programme-constraints.test.ts`, whose empty-premise
assertion is re-pinned by `b5/INT-5` and whose whole point is to be **loud when it has nothing to
check** — if it is green here, confirm from batch 5's report that it is walking a non-empty set of
revisions.

## The closing run's failures, attributed — recorded 2026-08-16

Three failures came out of the closing e2e run. They are recorded here **with their attribution and
their evidence**, whatever a re-run says, because the attribution is what makes them useful and it
does not depend on the outcome. **None is owned by this batch**, which changes no assertion's subject.

| Failure | What it is | Attribution |
| --- | --- | --- |
| `container-create-privileged.spec.ts:388` and `filesystem-browser-layout.spec.ts:645` | **One pre-existing product defect, two symptoms.** `Menu.tsx:138` registers `window.addEventListener('scroll', dismiss, true)` in the **capture** phase, so a scroll in *any* container dismisses the menu under the pointer. | Outside this plan: the file is **byte-identical to `main`** and was last touched **2026-08-12**, before this programme began. It needs **its own report**, not a repair inside a record batch — fixing a product defect here would put an unattributable change in the one batch whose value is that it changes nothing a run asserts. |
| `compose-row-geometry.spec.ts:923` | **An inherited fixture race**, the same kind and the same file batch 4 already repaired once under `b4/INT-7`. | Inherited: `git blame` puts the assertion at **`47fb52f` (2026-08-15)**, the reference plan's batch 11. A second instance of a shape this plan has already met and characterised. |

That the same file yielded a second race after `b4/INT-7` is itself worth carrying forward: the repair
there was to one spec's timing, and the class it belongs to — a stub answering the first read
differently from later ones — is a property of that file's fixture, not of the one assertion fixed.

## What is reported back

The amended requirements quoted in full, before and after. The list of annotated batch files with the
note each received — **ten**, and the reason the enumeration read nine. The sweep's counts from
`INT-4`. The measurement behind the corrected structural claim: the three unit files that read
`.sdd/modules/ui-library/`, run after the sweep's edits, with their result. And the outcome of the two
complete runs, with **every failure attributed** — to a batch of this plan, to the tree this plan
started from, or to a defect that needs a report of its own — never left as a count.
