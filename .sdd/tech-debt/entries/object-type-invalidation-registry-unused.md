---
id: object-type-invalidation-registry-unused
area: client
severity: low
cost: dead-code
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# The by-object-type invalidation registry is written and never used

**What** → `onDaemonObjectTypeChanged` — described by its own module comment as *"a by-object-type
invalidation registry so a view showing an affected object can re-read it automatically"* — is
exported and called from nowhere in the repository.

**Where** → `client/src/data/event-stream.ts:41`. Zero consumers in `client/src`, `server/src` and
`client/e2e`.

**Evidence** → a repository-wide search returns the declaration and nothing else.

**Why it matters** → it is the push-side mechanism that would have replaced part of the polling,
already written, never wired. Filed as debt rather than as dead code to delete, because it becomes
directly useful once the event carries a usable identifier — see
[[detail-views-reread-on-unrelated-events]].

**Direction** → either wire it (preferred, together with the actor-ID change) or remove it. What it
must not stay is exported, untested and unused, where it reads as an available facility that is not.
