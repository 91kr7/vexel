---
batch: 11
feature: F11 — compose
closed_req: [REQ-49, REQ-50, REQ-51]
depends: [5]
---

# Batch 11 — compose

The screen the analysis counts as "no list at all". In fact it is the **only** consumer of
`GroupedRowsPanel` (`ComposeScreen.tsx:208`, groups built at `:147`) — the fourth answer to "how is an
object listed", and the one component batch 5 rebuilt on the object-list primitive or retired into a
grouped variant of it. Its empty result, `No compose projects`, is bare text on no surface.

The grouping is real and must survive: a project holds its services, each with its own state.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, compose area | The check, written and run **first**: each project is a row of the one list; **each of its services is still visible with its own state**; opening a project's detail with a **real pointer click** gives a full-width panel with the two-column grid; and with no project present the empty result renders on a surface with a title, one line and its action. Report what was drawn before and after. | REQ-49, REQ-50, REQ-51 | — |
| INT-2 | modify | `client/src/compose/ComposeScreen.tsx` (:147, :208) | Migrate off `GroupedRowsPanel` onto the one paradigm batch 5 delivered, deleting the group-building code it replaces. Projects in name order, services in name order, the overall and per-service states all still shown. | REQ-49 | INT-1 |
| INT-3 | modify | `client/src/compose/ComposeScreen.tsx` | Reveal a project's detail through the detail-panel primitive: full content width, two-column property grid, tabs where the screen needs them — the compose file editor and the aggregated logs being the obvious candidates rather than three stacked regions. The editor keeps its validation, its dirty state and its **confirmed** save. | REQ-50 | INT-2 |
| INT-4 | modify | `client/src/compose/ComposeScreen.tsx` | Express `No compose projects` through the empty-state primitive: title, one line of explanation, and the action that resolves it. | REQ-51 | INT-2 |
| INT-5 | modify | `.sdd/modules/compose/specs/compose-screen.md`, `.sdd/modules/compose/index.md` | Record the screen's new shape, and — if `GroupedRowsPanel` was retired in batch 5 — that this screen no longer names it. English only. | REQ-49, REQ-50, REQ-51 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about up, down, restart, per-service scaling, the compose file read/validate/save, and the aggregated per-service log stream. | REQ-49, REQ-50 | INT-2 … INT-4 |

## Constraints on this batch

- **The log stream offered with no download filename is this screen's case** — Compose with no
  project selected — and `plan-docker_management_app-remove_copy_controls/REQ-12` certified that its
  action row then renders **nothing at all**: not an empty strip, not a gap. Verify it still does.
- Compose is the sole consumer of host-path validation on a write; the validated write-back and its
  confirmation are untouched.
- This screen holds **no `CardList` call site** — its list is `GroupedRowsPanel` — so the call-site
  budget in `client/scripts/check-ui-conformance.mjs` is **unchanged** by this batch. A budget that
  moved here means a `CardList` was introduced during the migration, which is exactly what the guard
  exists to catch.
- Feature code composes library components and nothing else.
