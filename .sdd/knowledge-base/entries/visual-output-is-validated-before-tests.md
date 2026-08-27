---
id: visual-output-is-validated-before-tests
kind: guideline
scope: development, test
date: 2026-08-27
source: chat, during the second pass on the container detail Config tab
---

# On a graphical fix, the human validates the visual output before any test is run

**Rule** → When the work is a graphical fix, stop after implementing it and show the result: the
human validates what it looks like, and only then are the tests written and run.

**Why** → "ho interrotto il test perché ci sono un paio di fix da fare prima! puoi annotarti che
quanto ti chiedo di fare delle fix grafiche prima di lanciare i test devo validare l'output visivo?".
Tests written against a look that is about to change are written twice, and a tester dispatched
early spends a run proving the wrong arrangement correct.

**How to apply** → development: implement, then present the visual — a screenshot of the real
application, plus the measurements that settle what was asked (boxes, edges, gaps) — and stop.
Test: the tester is not dispatched until the human has said the visual is right; their corrections
come first, and the checks are derived from the arrangement that survives them.
