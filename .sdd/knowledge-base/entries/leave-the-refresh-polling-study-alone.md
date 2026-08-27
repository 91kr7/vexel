---
id: leave-the-refresh-polling-study-alone
kind: guideline
scope: any
date: 2026-08-27
source: /sdd-analyse — swarm_removal cycle
---

# Leave the refresh-and-polling study alone

**Rule** → `.sdd/analysis/studies/refresh-and-polling.html` is ignored: never staged, never
committed, never edited, never reverted — whatever state the working tree shows it in.

**Why** → the human keeps it modified in the working tree on purpose and said so in plain terms:
ignore that file, and tell the agents too.

**How to apply** → every phase: leave the file untouched. Orchestrator: never `git add` it and never
report it as a change to resolve. Any phase: a working tree that is otherwise clean counts as clean
even with this file modified — see [[every-change-updates-spec-requirements-plan]] for what does have
to travel together.
