---
id: a-check-is-never-weakened-to-pass
kind: guideline
scope: development, test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# A defect in the product is repaired in the product; a check is never weakened

**Rule** → Two halves, and neither is negotiable.

- **If the defect is in the product's code, the product is corrected.** Never bend a check around a
  product that is wrong: "un test reso verde su un prodotto rotto è peggio di un test rosso, perché
  il rosso almeno si vede."
- **No check is weakened to make it pass**: no wait added, no retry, no softened assertion, no
  `timeout` raised to cover a slowness that is itself the defect. A check written badly is
  **rewritten so that it verifies what it claims** — not so that it stops complaining.

**Why** → the human's standing instruction for the repair of a red suite. A green check over a
broken product removes the only visible sign that anything is wrong.

**How to apply** →
- *test* → every red is triaged first: is the defect in the product or in the check? The trace says
  which ([[read-playwright-traces-without-a-browser]]).
- *test* → a budget that is genuinely too small is not raised until it passes: work out how long the
  thing being measured actually takes and make the arithmetic honest, in the open.
- *development* → the product's correction goes through the workflow like any other change
  ([[development-goes-through-sdd-dev]]), with its requirements and its batch
  ([[every-change-updates-spec-requirements-plan]]).
- *test* → keep the product's corrections and the checks' corrections in separate steps, so each is
  readable on its own.
