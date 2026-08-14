---
batch: 2 · derived-count-everywhere
feature: F3 — no caller states a column count
closed_req: [REQ-25, REQ-26, REQ-27, REQ-38]
depends: [1]
---

# Batch 2 — derived-count-everywhere

Requirement texts live only in [`../requirements.md`](../requirements.md); they are cited here by id.

**Order.** INT-1 is written and **run against the build batch 1 leaves behind** — where these five
surfaces are still exactly as delivered — and observed failing **with its measured numbers reported**
(REQ-42, which closed in batch 1 and constrains this batch's checks in full). Then the prop
retirement, then the five call sites, then the contract check and the documentation.

**These five surfaces are untouched by batch 1 by construction**: they pass `columns={2}`, so batch 1's
derived arrangement never reached them, and batch 1's INT-4 guards that as a measured fact. This batch
is where they change, which is what keeps a regression on them attributable to the work that asked
for it. Batch 1's requirements on how a check is written — geometry not content (REQ-39, REQ-40), a
real pointer at visible coordinates (REQ-41), red on the build it is written against with the numbers
reported (REQ-42), no geometry in jsdom (REQ-43), the project's fixture discipline (REQ-44) — are
**constraints on this batch's checks in full**, closed in batch 1 and not re-opened here.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/e2e/` — batch 1's untouched-surfaces guard becomes this batch's measurement | **Delete the guard, put the measurement in its place** — deleted, not commented out, because a guard that has served its purpose and stayed is how a plan's record stops being true. For each of the **five** surfaces — swarm services, secrets, configs & stacks, nodes, and the About screen's coverage matrix — opened with a **real pointer at the visible control's coordinates**: with the section's own measured width near **400px**, the section is **exactly one column** (deduced from measured band positions, never from a class or an attribute) and **no value wraps across more than one line** — the 19-character `sha256:` digest in particular, whose delivered three-line wrap and ~150–180px cell are measured on the pre-batch build and **reported as the before** (REQ-26). At a wide width, each of the five shows **at least the two columns it showed before** — the count never falls (REQ-2, verified here for these surfaces). Nothing clipped, nothing overlapping, every property still present with its label and its value, stated beside the geometry and never instead of it. Own fixtures with the ownership labels — a swarm state and its objects created and removed in a `finally` — no assumption of an empty daemon, no inherited application state, no reach to Docker Hub, each spec passing on its own. | REQ-26 | — |
| INT-2 | modify | `client/src/ui/data/DefinitionList.tsx` and its stylesheet (`client/src/ui/data/data-table.css`) | **Retire the caller-stated count.** The `columns?: 1 \| 2` prop is **removed from the public API** — not deprecated, not defaulted, removed — together with the `ui-definition-list--columns-2` class and its `grid-template-columns: 1fr 1fr` rule, which is the unbounded two-track grid with no minimum and no breakpoint that produces the ~150–180px cell (REQ-25). Every list then arranges itself by batch 1's derived rule at its declared content class, so these five sections gain the bounded minimum they never had (REQ-26). Nothing else in the component changes: the pair stays one element, the copy affordance stays beside its value, the row's padding, type and step are untouched. | REQ-25, REQ-26 | INT-1 |
| INT-3 | modify | `client/src/swarm/SwarmServicesPanel.tsx`, `client/src/swarm/SwarmSecretsPanel.tsx`, `client/src/swarm/SwarmConfigsStacksPanel.tsx`, `client/src/swarm/SwarmNodesPanel.tsx`, `client/src/coverage/CoverageMatrixScreen.tsx` | **The five call sites stop guessing.** Each drops its `columns={2}` and **declares its content class instead**, deliberately and per call site: a list of short scalar properties takes the short-scalar default and states nothing at all; a list carrying long single-line values (a joined constraint list, a label set, a baseline string) declares long single-line, and the choice is recorded for INT-5 (REQ-25, REQ-27). Nothing else in these files moves: no property is added, removed, renamed, reordered or reformatted, and no file gains a count, a track template, a width, a `style` or a CSS import. After this batch **no feature file anywhere in the product states a column count, a track template or a width for one of these sections** — the `Config` tab's `1fr 1fr` having gone in batch 1 (REQ-27). | REQ-25, REQ-26, REQ-27 | INT-2 |
| INT-4 | modify | `client/test/unit/` — the property list's contract test and the call-site contract checks batch 1 added | **Contract and state only** (REQ-43, closed in batch 1 and binding here): the component's public API **no longer offers a column count**, and a caller attempting to state one does not typecheck; **no feature file in `client/src` passes a count, a track template or a length to a property list**, asserted as a check over the sources rather than as a claim in a plan — grep-able for `columns={`, for the retired class name and for `1fr` in these call sites, and empty (REQ-25, REQ-27). No geometric claim is made here, and the file says so on the spot. | REQ-25, REQ-27 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/ui-library/specs/definition-list.md` and the index rows batch 1 touched | Close the record: the retired prop is **removed from the component's contract**, and with it batch 1's note that it was a known defect left standing — a spec that still lists a prop the code does not have is worse than one that never mentioned it. The three content classes, their stated minima and maxima and the derived count remain the whole of the contract, and the **classification recorded for every one of the ~25 call sites is completed with these five** (REQ-38). English only. | REQ-38 | INT-2, INT-3 |

## What the implementer must not get wrong

- **Removed, not deprecated.** A prop left in place with a console warning leaves the product with two
  competing answers to "how many columns", which is the finding this whole report rests on. The type
  must refuse it.
- **Do not re-open batch 1's surfaces.** The image detail panel and the container `Inspect`/`Config`
  tabs must measure exactly what batch 1 left them measuring. If a change here moves either of them,
  the correction is in the wrong place.
- **The ~400px case is the point of this batch, not the wide one.** At ordinary widths these five
  surfaces already looked acceptable; the defect is the narrow card where a digest wraps across three
  lines, and it is the width nobody opens. Measure it.
- **Delete batch 1's guard, do not weaken it.** Leaving it asserting "two columns" while the code
  derives the count would either fail the run or, worse, be softened into something that passes on
  both builds.
- **Five surfaces, not four and a shrug.** The coverage matrix on the About screen is the easiest of
  the five to forget, because it is not a Docker object screen at all.

## Verification

**Test runs in this batch are batch-scoped, in both phases**, exactly as batch 1:

- `npm run lint`
- `npm run test:typecheck -w client` — which is also where the retired prop's removal is proved
  against every call site
- `npm run test -w client` — including the UI-conformance check, unmodified and passing
- this batch's own e2e specs, **each run on its own**: the five-surface measurement (INT-1), plus —
  as this batch's evidence that batch 1 is undisturbed — batch 1's image-panel and container-panel
  geometry specs, which are **expected to pass unchanged**, and the delivered `swarm.spec.ts` and the
  About/coverage spec, likewise expected to pass unchanged; any edit either turns out to need is
  reported with its reason.

**Neither phase launches the complete unit suite or the complete e2e suite.** The human has
instructed that both run **once, at the end of the whole five-report tranche**, on his own daemon; a
subagent starting a full run competes with him on that same daemon and fails in plausible-looking
places. If a change appears to need wider coverage than the list above, that is a question for the
orchestrator, not a reason to widen the run.

- INT-1 is run **before** INT-2 and INT-3 exist, and reported with the measurements it produced: the
  measured cell width and the digest's line count at a ~400px section on each of the five surfaces,
  beside the same measurements after.
