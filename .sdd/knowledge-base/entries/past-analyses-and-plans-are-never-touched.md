---
id: past-analyses-and-plans-are-never-touched
kind: guideline
scope: any
date: 2026-08-27
source: /sdd-plan — swarm_removal cycle, requirements validation
---

# The past is never touched: analyses and plans are a record

**Rule** → Analyses and plans already on file are never modified, whatever the current request
removes or changes. Every plan is isolated: the only plan an agent may write in is the one the
current cycle created. Component specifications and their indexes are the exact opposite — they
mirror the structure of the application, so whatever the application loses, they lose in the same
turn.

**Why** → an analysis and a plan record what was decided and built at the time. Editing them to
match today's product falsifies the record, and a certified batch is closed by the method anyway.
A specification is not a record: it describes the application as it stands, so a stale one describes
something that no longer exists.

**How to apply** → Analysis: never amend an earlier analysis to reflect a new request; write the new
one and reference the old. Planning: read earlier plans, never edit them; carry the removal into the
component specs and the indexes instead. Development and test: a removal deletes the specs of what
it removed and updates every index pointing at them — see
[[every-change-updates-spec-requirements-plan]]. Orchestrator: never propose amending a past analysis
or plan as part of a removal.
