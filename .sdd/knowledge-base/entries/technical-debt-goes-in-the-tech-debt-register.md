---
id: technical-debt-goes-in-the-tech-debt-register
kind: guideline
scope: any
date: 2026-08-27, revised 2026-08-29
source: chat, after the second reading of the refresh-and-polling study; revised in chat after the version-negotiation debt was fixed
---

# Technical debt goes in the tech-debt register, not in the code and not in a plan

**Rule** → Any technical debt worth fixing later is recorded in `.sdd/tech-debt/`: one entry under
`entries/`, one row in `index.md`. Never as a `TODO` in the source, never as an extra intervention
smuggled into a plan that did not ask for it, never only in a chat reply.

**Why** → a debt noticed during other work has two bad endings: it is done immediately, and widens a
change nobody scoped; or it is mentioned once and lost. The register is the third ending — written
down with its evidence, costing nothing now, and available to whoever scopes the next cycle. It also
keeps the finding and its measurements together, so the next reader does not have to rediscover why
it mattered.

**How to apply** → any phase: when a debt surfaces, write the entry in that same turn and add its
index row, then carry on with the work that was actually asked for. An entry states **what**,
**where** (file and line), the **evidence** — measured, not asserted — **why it matters**, and a
**direction**, which is a direction and not a decision. Do not schedule it: an entry is not a work
order, see [[an-opinion-asked-for-is-not-a-work-order]].

**A debt that has been fixed is removed from the register** — the entry file and its index row —
said on 2026-08-29, when the version-negotiation entry was closed and left standing. The register
holds what is still open, so its length is the size of the problem and not of the history. This
reverses the earlier instruction to mark an entry `status: closed` and leave it in place; the
`status` field survives for entries being worked on, not as an archive. The record of the fix is
where the work was done — the plan's requirements and batch, and the commit that carried them — so
the register is **not** a record in the sense the analyses are, and
[[past-analyses-and-plans-are-never-touched]] does not extend to it.

**Boundary** → the register holds debt: something that works but costs more than it should, or is
right by accident. A defect the operator can see is not debt — that is a fix, and it goes through
the normal cycle.
