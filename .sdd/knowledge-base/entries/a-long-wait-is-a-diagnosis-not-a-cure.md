---
id: a-long-wait-is-a-diagnosis-not-a-cure
kind: how-to
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# Telling a timing problem from a real one: the wait is a probe, never the repair

**Rule** → To find out whether a red is about timing or about the product, put a wait of about
25 seconds in front of the assertion. If the check then passes systematically, the datum was
arriving late. **It is a diagnosis, not a cure**: the wait is always removed afterwards, and the
question becomes why the datum was late.

**Why** → the human's own method, given with the mandate to repair the red suite. It separates "the
value never comes" from "the value comes after the budget", which the failure message alone does not.

**How to apply** →
- *test* → the probe is temporary and never committed; leaving it in is exactly the weakening
  [[a-check-is-never-weakened-to-pass]] forbids.
- *test* → a probe that turns the check green hands the work to the next question: what makes the
  datum late, and is that lateness itself the defect.
