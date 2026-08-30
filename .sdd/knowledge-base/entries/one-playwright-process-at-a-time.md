---
id: one-playwright-process-at-a-time
kind: how-to
scope: test
date: 2026-08-31
source: chat, the overnight repair mandate on the red e2e suite
---

# Never two Playwright processes at once

**Rule** → "Mai due processi Playwright contemporaneamente." Never start one while another command
is still running, and check that nothing is pending before launching.

**Why** → every spec drives the same Docker daemon and the suite serves the product on a port of its
own; two runs at once turn contention into failures that say nothing about the product.

**How to apply** →
- *test* → before launching, list what is alive and kill it — [[kill-pending-processes-before-tests]]
  — and confirm no earlier test command is still running.
- *test* → a full pass costs about twenty minutes: use it to **discover** what is red and to
  **verify** at the end, and work on the single spec file in between.
