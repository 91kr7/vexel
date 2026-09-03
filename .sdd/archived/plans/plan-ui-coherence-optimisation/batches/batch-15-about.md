---
batch: 15
feature: F16 — About
closed_req: [REQ-70, REQ-71, REQ-72]
depends: [5]
---

# Batch 15 — about

**Three section-header treatments on one screen**, which is why the analysis picks it out: uppercase
micro-caps *outside* a card (`IDENTITY AND LICENSE`), sentence case *inside* a card (`CLI
availability`), and uppercase *inside* a card (`DAEMON EVENT STREAM`). And the third of them is a
duplication as well: the `DAEMON EVENT STREAM` repeats the Dashboard's stream verbatim.

Decided at the gate: **the Dashboard keeps the stream, About loses it.** About is an identity and
licence screen; a live event feed has no business on it.

The screen is composed by the shell (`client/src/shell/Shell.tsx` renders it, `AboutNotice.tsx`
carries the notice, `client/src/coverage/CoverageMatrixScreen.tsx` the coverage half).

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, about area | The check, written and run **first**: every section title on this screen renders in **one** treatment — asserted on the computed type and case of each, not by eye; **no event stream is present**; and the notice's every clause is still present with its exact text. Report the three treatments before and the one after. | REQ-70, REQ-71, REQ-72 | — |
| INT-2 | modify | `client/src/shell/Shell.tsx` (the About screen's composition) | Bring every section of the screen under the one section-header treatment, and **remove the daemon event stream** with its subscription — no orphaned import, hook call or type left behind. | REQ-70, REQ-71 | INT-1 |
| INT-3 | modify | `client/src/shell/AboutNotice.tsx` | Adopt the one section-header treatment for the notice's own titling. **Not one word of the notice changes**: product name, copyright, licence with a route to each of its two documents, absence of warranty, right to convey, repository with the running version, network-modification duty, reservation of the name. | REQ-70, REQ-72 | INT-2 |
| INT-4 | modify | `client/src/coverage/CoverageMatrixScreen.tsx` | The same for the coverage half: the one section-header treatment, the declared baseline next to the connected daemon with the mismatch still visible, every capability area with its coverage state and the way to reach it, and its `DataTable` inheriting batch 2's column contract with no local override. | REQ-70 | INT-2 |
| INT-5 | modify | `.sdd/modules/app-shell/specs/shell.md`, `specs/about-notice.md`, `.sdd/modules/coverage/specs/coverage-matrix-screen.md` | Record the screen's new shape and the removal of the event stream **with its reason**, so it is not restored as a missing feature. English only. | REQ-70, REQ-71 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering About and the coverage matrix | Update the coverage the change invalidates. The notice's assertions — the certified subject of `plan-docker_management_app-about_license_notice` — are **kept in full**. Coverage of the removed stream is removed, not neutered; the Dashboard's own stream coverage stays. | REQ-71, REQ-72 | INT-2 … INT-4 |

## Constraints on this batch

- **The licence notice is a legal artefact, not copy.** `plan-docker_management_app-about_license_notice`
  is certified and every clause of it must read exactly as delivered after this batch. Only its
  titling treatment may change.
- Removing the stream from About must not touch the app-wide event-stream service, which the
  Dashboard and the invalidation registry depend on: one consumer stops subscribing, nothing else
  moves.
- Feature code composes library components and nothing else.
