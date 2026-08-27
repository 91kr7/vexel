---
id: every-change-updates-spec-requirements-plan
kind: guideline
scope: planning, development, test
date: 2026-08-27
source: chat, during the UX review of the container detail Config tab
---

# A change to the product updates the spec, the requirements and the plan

**Rule** → Every change to the product must be carried into the component spec, the requirements and
the plan, in the same turn as the change itself.

**Why** → "ora bisogna andare ad aggiornare le spec, i requirements ed il plan!!!" — said on
2026-08-27, when a change to the Config tab had updated only the component spec and left the plan
describing the arrangement it had just replaced.

**How to apply** → development: the component spec under `.sdd/modules/<module>/specs/` and the
module's `index.md` row. Planning: new requirement ids under a feature section of the plan's
`requirements.md`, and a new batch in `batches/` registered in `batches.md` — a change made outside
the batches is appended as a further batch, never edited into a certified one. Test: the checks the
change invalidates are rewritten against the new artifacts, not deleted.
