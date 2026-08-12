---
batch: 1 · privileged-path-verification
feature: F1 — The privileged path under standing verification, and the investigation on record
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25]
depends: []
---

# Batch 1 — The privileged path under standing verification, and the investigation on record

A reported crash — "containers > run container. selecting privileged the popup crashs!" — **does not
reproduce**, on the current build or on the build the report was written against. This batch
therefore **fixes nothing**. It puts the privileged path under a standing end-to-end check shaped
around the reported *symptom*, and it makes the investigation's record reachable from the three
places a later reader starts. One new e2e spec, one appended line in `bugs.md`, one cross-reference
in a component spec. **No product file is touched.**

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not
restate it here.

## Read this before you write a line of it

**A check that asserted only "a privileged container was created" would have passed during the very
screenshot the human sent.** The artifact shows a surface that is present, correctly positioned and
drawing nothing of its own, over an application that is otherwise intact — and the investigation's
own fourth attempt created a container successfully behind a form that was working. Presence of a
surface is not evidence of its content. Everything below is arranged around that one sentence; if
you find yourself simplifying an assertion into "the sheet is visible", you have written the check
that would not have caught the thing this item exists for.

**And you are not fixing anything.** No cause has been identified and no line of the product can be
named as wrong. A change against an unidentified cause cannot be shown to have worked, cannot be
shown not to have broken something, and would close the report while leaving whatever the human saw
exactly as it is. If you feel the urge to harden something plausible while you are in the file:
don't — report it instead.

## What is already true, and must stay true

Read before starting. These are the facts the interventions are written against, taken from the
`containers` module index and specs, from `.sdd/.archi`, from `CLAUDE.md` and — for the test tree,
which no spec documents — from the neighbouring spec files themselves.

- **The form** (`containers/specs/container-create-form.md`,
  `client/src/containers/ContainerCreateForm.tsx`) is a `FormSheet` whose body is a stack of
  `FormSection`s. The last section is **"Privileges"**, described as *"Privileged mode gives the
  container full access to the host's devices."*, holding a `FormField label="Privileged"` around a
  `Toggle … label="Run privileged"` — a real `<input type="checkbox">`, so it is addressable as a
  checkbox by the accessible name `Run privileged` and its state is assertable with `toBeChecked()`.
  The privileged value is a plain boolean: nothing is derived from it during render, and no branch
  depends on it.
- **The footer offers three actions**: `Cancel`, `Create only` and `Create and start`. Both commit
  actions go through the same submission; the entry point only decides which is *primary*
  (`containers/specs/container-create-form.md:39-41`). **This batch clicks `Create only`, always.**
- **The two entry modes.** Containers screen toolbar → `Run container…` (primary action
  `Create and start`) and → `Create from image…` (primary `Create only`) open the **same component**
  on the same screen (`containers/specs/containers-screen.md:65`). The genuinely different route is
  **Images & layers → an image row → `More actions for …` → `Run…`**, which mounts the form from
  another screen with the reference pre-filled — exactly as
  `client/e2e/container-create-run.spec.ts:254-284` already reaches it. Those are the two modes to
  cover.
- **The sheet's root in the DOM is `.ui-form-sheet`**, which is how the existing spec scopes the
  sheet's own actions apart from the screen's (`container-create-run.spec.ts:44-47`). The card is
  drawn by the shared overlay glass; bug-1's correction to `Modal` did not touch `FormSheet`, which
  was measured and confirmed unaffected (`plan-docker_management_app-dialog_sizing/REQ-13`).
- **The existing coverage of the privileged option is one assertion**, at unit level against a mocked
  client: `client/test/unit/container-create-form.test.tsx:156` clicks `Run privileged` and asserts
  the composed spec carries `privileged: true`. It establishes that the form's state maps a toggle to
  a field — not that the daemon receives it, not that the container is privileged, and not that the
  sheet survives the interaction. **It stays exactly as it is** (REQ-15).
- **The e2e test rules** (`CLAUDE.md`, "Tests — non-negotiable rule", and `.sdd/.archi`): import
  `test` from `client/e2e/support/test.ts` (not from `@playwright/test`) — that is the automatic
  fixture that empties the run's `VEXEL_DATA_DIR` before every test; pin the screen with `openApp`
  rather than trusting the one the last spec left; assume nothing about the daemon's contents; assert
  on your own fixtures, never on totals or on a list being empty; remove what you create with
  `docker rm -fv` in a `finally`; and pass when the file is run on its own.
- **The fixtures the suite prepares for itself** (`server/test/support/base-images.ts`):
  `TINY_IMAGE = "vexel-test-tiny:1"`, built `FROM scratch` with one file and a `CMD`, fetched from
  nowhere; `ensureImage(reference)` is how a spec asks for it and is idempotent. `ALPINE_IMAGE` is
  the one for a container that must actually stay up — **which this batch never needs**.
- **Ownership labelling** (`client/e2e/support/fixtures.ts:33-49`): `OWNER_LABEL = 'vexel.test.run'`
  set to `RUN_ID`, `CASE_LABEL = 'vexel.test.case'` set to the case name. `ownershipArgs()` produces
  them as CLI flags — **useless here, because the product creates the container, not the test**. The
  same two pairs go in through the form's own "Labels" section.
- **`openApp(page, screenId)` and `navEntry(page, label)`** (`fixtures.ts:74-93`): the second is
  scoped to the navigation rail on purpose, because the Dashboard's cross-navigation tiles name the
  same screens and an unscoped locator matches more than the rail entry.
- **The key/value editor rows are announced with their section's name**: `Environment Key 1`,
  `Labels Key 1`, `Labels Value 1`, … (`container-create-form.md`, and
  `container-create-run.spec.ts:212-237`). `Add label` is the button that adds a row.
- **No spec in `client/e2e/` listens on `pageerror` or on console errors today.** This batch is the
  first; there is no house pattern to follow and none to break.
- **The e2e suite runs with a single worker** and drives the delivered single-process build on port
  3100 (`.sdd/.archi`, `client/playwright.config.ts`). `npm run test:typecheck -w client` is the only
  pass that typechecks the e2e tree at all.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e tree (`client/e2e/`), a spec of its own for the privileged path through the container create form — not in `exclusive/`, and not folded into `container-create-run.spec.ts` (that file is `mode: 'serial'` around a shared pullable image this check has no use for, and its header could not honestly describe this one) | **The standing check, shaped around the symptom.** A file-level narrow viewport, `test.use({ viewport: { width: 813, height: 800 } })` — the width the reproduction attempts used, so every test in the file runs narrow rather than one of them remembering to (REQ-7); `test.beforeAll` → `ensureImage(TINY_IMAGE)`, and `beforeEach` → `openApp(page, 'containers')`, both per the rules above (REQ-8, REQ-12). **A local helper is the heart of it**: given the open sheet, it asserts the sheet is *drawing its own content* — `.ui-form-sheet` visible; its section headings, the image field, the container-name field, the "Privileges" section, the `Run privileged` toggle and all three footer actions present **and carrying their text**; and the length of the sheet's rendered text at least what it was before the interaction. The investigation measured **1154 characters before and after the toggle, on both builds** — the control derives nothing during render, so equality is the honest assertion; if you measure a legitimate difference, record the measurement in a comment and assert the exact new relation, **never a bare "not empty"** (REQ-1). The helper takes a short timeout so the negative control below fails fast rather than burning the default on every landmark. **Test 1 — the interaction, from the containers screen** (REQ-1, REQ-2, REQ-7): `Run container…`, capture the content signature, click `Run privileged`, assert the helper still holds **and** the toggle now reads checked, `Cancel`, sheet gone; nothing is created. **Test 2 — the negative control, and it is permanent** (REQ-3): open the same sheet, then in the page blank the sheet's own content (its root `.ui-form-sheet` left in place, its children removed) so the surface is **present and empty** — the symptom the screenshot depicts — and assert the helper **rejects**. This is what stands in for "seen red on the unfixed build": there is no defect to fail against, so the only evidence the check detects anything is to construct the symptom and watch the assertion refuse it. It touches no daemon. **Test 3 — the daemon holds the flag, from the containers screen** (REQ-1, REQ-2, REQ-4, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13): `Run container…`, image `TINY_IMAGE`, a name of the form `vexel-e2e-privileged-<Date.now()>`, two rows in **"Labels"** carrying `vexel.test.run` = `RUN_ID` and `vexel.test.case` = the case name (the product creates the container, so this is the only way it can be labelled — `ownershipArgs`' own pair, entered through the form, so `npm run test:sweep -w server` can still recognise it), toggle `Run privileged`, assert the helper still holds and the toggle is checked, then **`Create only`** — never `Create and start`. Assert the row appears in state `created`, then ask the daemon: `docker inspect <name> --format '{{.HostConfig.Privileged}} {{.State.Running}}'` → **`true false`**. Both halves are the assertion: privileged as the daemon holds it (REQ-4), and never started (REQ-13). `finally` → `docker rm -fv <name>`, swallowing failure, so a failed run cleans up as thoroughly as a passing one (REQ-10). **Test 4 — the same, from the image entry** (REQ-5): the rail entry `Images & layers` via `navEntry`, search the tiny image, its row's `More actions for …` → `Run…`, assert the reference is pre-filled, then the identical toggle-assert-label-`Create only`-inspect-cleanup sequence. **Across every test — uncaught failures are an assertion, not an observation** (REQ-6): register `pageerror` and console-error listeners for the duration of each test and fail it if anything was captured. This is the automatic form of the investigation's most useful negative finding, which a human obtained by watching a console. If the application emits benign noise, narrow the exclusion to **precisely that message with a comment saying why**; a filter wide enough to be comfortable finds nothing. **The file's header comment is a deliverable, not decoration** (REQ-21, REQ-22, REQ-25): it names the record — `.sdd/analysis/docker_management_app-privileged_toggle_verification.md` — says in one line why the check is shaped around a sheet that is *present and blank* rather than around a successful create, and states in its own words that **this check runs in one browser engine, cannot observe an engine-specific paint failure, and therefore cannot clear bug-2**, and that it creates the container without ever starting it, so `Create and start` is not covered. Someone simplifying this file later must meet the reason before they touch it. **Finally, what this intervention must not do** (REQ-14, REQ-15, REQ-16): change no file under `client/src/` or `server/src/`, not even a label or a `data-` attribute added "to make the test easier"; leave `client/test/unit/container-create-form.test.tsx` exactly as it is; add no dependency; write no second account of the investigation — the header points at the record, it does not summarise it. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-21, REQ-22, REQ-25 | — |
| INT-2 | modify | `bugs.md` (repository root) — the human's own bug list, under the **bug-2** entry | **One appended annotation line, and nothing else in the file changes.** It says: the item was investigated, it did not reproduce, and where the record is (`.sdd/analysis/docker_management_app-privileged_toggle_verification.md`). It is the pointer for the reader who starts where the next investigator will actually start — this whole item exists because the previous one started from zero (REQ-25). **Constraints, all hard**: append it **under** the bug-2 entry, do not move it elsewhere in the file; make it **visibly an annotation** rather than part of the report; and do not alter, reflow, re-indent or reword **a single character the human wrote — the typos included**, in bug-2 or in any other entry. It carries **no hypothesis and no conclusion** — not "no defect found", not "cannot reproduce, closing": that is what the pointer leads to, and a one-line verdict in a bug list is precisely how a weak conclusion becomes a strong-sounding one (REQ-16). Nothing about change-1, change-3, bug-1 or bug-3 is touched. | REQ-14, REQ-16, REQ-25 | — |
| INT-3 | modify | `.sdd/modules/containers/specs/container-create-form.md` — the spec of the component the report names | **First read the record, then point at it.** The record is `.sdd/analysis/docker_management_app-privileged_toggle_verification.md`; **no second account of it is written anywhere** (REQ-16). Before writing the pointer, **confirm by reading** that it carries: the attempts with their arrangements, entry paths, builds and viewport (REQ-16); the baseline result on `3725389` **together with the control that proves that build really was the pre-work code** — no class at all on the dialog's grid item, Create context at card 765 / content 480, bug-1 present and unfixed (REQ-17); what was measured from `bugs-screen/bug-2.png`, the crop included (REQ-18); what the evidence excludes versus what it leaves standing (REQ-19); the measured/inferred/assumed distinction (REQ-20); the cannot-clear-bug-2 statement (REQ-21); the open thread of questions only the human can answer (REQ-23); and that a reproduction belongs in a **new** fix analysis referencing it rather than in an edit of it (REQ-24). **If any of that is missing, report it — do not repair it**: not by writing a second account, which REQ-16 forbids, and not by editing the analysis, which is not this plan's file to edit. Then add one short entry under the component's rules and invariants: the privileged path is covered end to end by `client/e2e/container-create-privileged.spec.ts`, which asserts the sheet still draws its content after the toggle and that the daemon holds `HostConfig.Privileged`; the investigation behind it — bug-2, reported and not reproduced — is recorded in the analysis, named by path; and, in its own words, that **the coverage runs in one browser engine and therefore cannot clear bug-2**, and that it creates the container without starting it (REQ-21, REQ-22, REQ-25). Nothing about the component changes: no file under `client/src/` is edited for this, and the component's own contract, rules and dependencies are left as they are (REQ-14). The module index needs no edit — no component is added or renamed. | REQ-14, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-25 | INT-1 |

## Order

`INT-1` → `INT-3` → `INT-2`.

The check is written first because everything else points at it: INT-3 names its path and repeats
its limit, and INT-2 is the annotation you only want in the human's file once the work behind it
exists. Within INT-1, **write the content helper and its negative control (test 2) before the tests
that create anything**: a helper that has never been seen to reject is not evidence of anything, and
it is far cheaper to discover that with no daemon involved.

## Out of this batch

From the spec's own Scope, and not to be drifted into: **any fix** — no change to the privileged
control, the create form, the `FormSheet` it is drawn on, or the UI library; **any redesign or
reconsideration of privileged mode itself** — its placement, its wording, whether it should carry a
warning or be restricted (the comparison with other tools is context, not a request); **error
boundaries or any failure-reporting capability**, split off deliberately and opened as its own item —
it would neither have prevented nor fixed bug-2, and folding it in would turn a defect report into a
feature request; **cross-engine or cross-browser verification**, declined for this piece of work with
its cost stated; **extending coverage to the create form's other options**, real as that gap is;
**starting a privileged container** under any justification; and **bug-1, bug-3 and the three
`change-` items** of `bugs.md`. No server code, no endpoint, no Docker API call and no dependency is
touched.

## Human acceptance

**First, that nothing moved.** At a narrow window (~813px) open **Containers → `Run container…`**,
toggle **`Run privileged`**: the sheet stays exactly as it was — every section still drawn, the
toggle now on — then `Cancel`. The form, its wording, its layout, its sections and all three actions
are identical to before this batch. `git status` shows **no file under `client/src/` or
`server/src/` touched**, and `client/test/unit/container-create-form.test.tsx` unmodified.

**Then the check.** Read `client/e2e/container-create-privileged.spec.ts`. Its header names the
record, says why the check is shaped around a sheet that is *present and blank* rather than around a
successful create, and states in its own words that this check **runs in one browser engine and
therefore cannot clear bug-2** — if that sentence is absent, the batch is not done. Run the spec on
its own and watch it pass, the **negative-control** test included: it blanks the open sheet's content
in the page and proves the content assertion **fails** on a surface that is present and empty. That
test is the substitute for bug-1's "seen red on the unfixed build", and it must be reported as
having been observed doing its job.

**Then that the machine is as it was.** `docker ps -a --filter name=vexel-e2e-privileged` returns
nothing, no new anonymous volume is on the daemon, and **no privileged container was ever started**:
the check clicks `Create only`, never `Create and start`, and asserts `State.Running` is `false`
beside `HostConfig.Privileged` being `true`.

**Then the record's reachability.** `bugs.md` carries **one appended annotation line under bug-2**,
visibly an annotation, saying the item was investigated, did not reproduce, and where the record is —
with the human's own text, typos included, **unaltered to the character**, and with no verdict of its
own. `.sdd/modules/containers/specs/container-create-form.md` carries the cross-reference naming the
record, the new spec and the single-engine limit. The implementer reports having **read the record
and confirmed** it carries the baseline result *with its control*, the crop measurement, the excluded
and standing hypotheses, the measured/inferred/assumed distinction, the open thread and the
cannot-clear sentence — and reports anything missing rather than repairing it.

**The batch's test runs are batch-scoped**, and the tester runs exactly these: `npm run lint`,
`npm run test:typecheck -w client` (the only pass that typechecks the e2e tree) and this batch's
single e2e spec, run on its own. No client unit pass is in scope — no file under `client/src/` and no
existing test file is touched. No server pass — nothing server-side exists in this batch. **The full
unit suite and the complete e2e suite are not this batch's business**: they run once at the end,
after every item of `bugs.md` has been certified — bug-2 is the **fifth of six**.
