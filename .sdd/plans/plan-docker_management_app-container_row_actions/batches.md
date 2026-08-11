---
slug: docker_management_app-container_row_actions
date: 2026-08-11
spec: .sdd/analysis/docker_management_app-container_row_actions.md
requirements: .sdd/plans/plan-docker_management_app-container_row_actions/requirements.md
status: validated
---

# Batches — Container row actions

Evolution of a certified product. One feature, one batch, eleven interventions. Batch numbers and
`REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not `plan-docker_management_app/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · container-row-actions | F1 — Container row actions: three on the row, the rest in an overflow menu | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26 | — | todo | On the Containers screen, every row ends with exactly four controls: a run/halt action (`Stop` running, `Start` stopped, `Resume` paused), `Pause`, `Restart`, and a `…` control — in that order, in the same positions, on every row and in every state, with the inapplicable ones present and greyed and each stating why (a stopped container shows `Pause` and `Restart` inert). The name cell no longer carries a pencil. Opening a row's `…` shows exactly four entries in this order: `Rename…`, `Export filesystem…`, then, set apart and in the destructive tone, `Kill` with `SIGKILL` beside it and `Remove` with `rm` beside it — and no `Duplicate config`. Opening another row's `…` closes the first. `Escape`, a click outside and choosing an entry all close it and put focus back on the `…`. `Tab` reaches the `…`, `Enter` opens it, the arrow keys walk the entries, `Enter` runs one. Opening the `…` on the last row of a list long enough to scroll shows the whole menu, unclipped, and clicking it does not open the row's detail panel. `Rename…` starts the same inline name editor the pencil started, with the same save/cancel; `Export filesystem…` downloads `<name>.tar` and toasts "Download started"; `Kill` and `Remove` still open exactly the confirmation they opened before, and cancelling still does nothing. The container detail panel no longer offers "Export filesystem…" and offers nothing in its place. Stopping a container from a terminal while its menu is open updates the row as promptly as before and the menu either follows that container or closes — it never acts on another one. `npm run lint`, `npm run test -w client` (the UI conformance check included, with `client/scripts/check-ui-conformance.mjs` unmodified) and this batch's e2e specs pass, and the specs that used to click `stop`/`kill`/`rm` on a row now reach the same operations through their new entry points rather than having been deleted. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **One vertical batch, not two.** Splitting the library menu from the containers row would be a
  split by layer, which the batching rule forbids, and neither half is acceptable alone: a menu
  component nothing opens has no acceptance criterion, and a row stripped of `Kill`/`Remove` before
  the menu exists ships a capability loss. The library component is ordered first *inside* the batch
  through `INT-1 → INT-3 → INT-4 → INT-5`. Confirmed at the requirements gate.
- **The menu asks for the existing overlay glass material; the enforced allow-list is not widened.**
  It carries `Surface material="overlay"`, i.e. `.ui-overlay-glass` — already allow-listed, already
  declared on its own `::before` layer, already valued `var(--blur-overlay)`, and already the way
  `Modal`, `FormSheet` and the toasts blur. Consequences, all deliberate:
  **`client/scripts/check-ui-conformance.mjs` is not edited** and `blurAllowedOverlaySelectors` gains
  no entry; no `.ui-menu…` selector declares a blur of its own; no second blur value appears. What is
  edited is documentation — the parenthetical of the `.ui-overlay-glass` row in `CLAUDE.md`'s
  allow-list table, which enumerates the surfaces asking for that material and must now name the
  menu, together with the cap that makes it legal (REQ-14: at most one menu open at a time, so the
  count is exactly one, as it is for the dialogs). The per-row `…` trigger blurs nothing whatever —
  that is the half of the rule which actually protects a long scrolled list. **If the implementation
  finds itself wanting to add a selector to the check script, it has stopped reusing the material and
  invented a second one: stop and come back rather than widen the list.**
- **Rename keeps today's mechanism; only its entry point moves.** `ContainersScreen` already renames
  through an inline editor on the name cell (`startRename` → `TextField` + "Save name"/"Cancel
  rename" icon buttons). `Rename…` in the menu calls that same `startRename`; the pencil
  `IconButton` on the name cell goes. No rename dialog is specified, and REQ-21 is exactly why: an
  operation whose mechanism changed at the same time as its entry point cannot be verified to have
  stayed the same. The trailing ellipsis is satisfied by the editor appearing.
- **The row's legality matrix is today's, re-rendered, not a new one.** Today the row shows a
  variable set (`containers-screen.md`): running → stop, pause, restart, kill, rm; paused → start,
  unpause, restart, kill, rm; restarting → kill, rm; created/exited/dead/removing → start, rm. The
  batch file fixes the four slots and marks *absent-today* as *disabled-now*; no action becomes legal
  in a state where the product does not offer it today, and none stops being legal where it does.
- **The one place the row's set narrows: `start` on a paused container.** Today a paused row carries
  both `start` and `unpause`. The new first slot carries one run/halt action, and for a paused
  container the spec and the screenshot both say that action is `Resume` (unpause). `start` is not
  carried over there — same intent, one control, which is what the screenshot draws. This is not a
  capability loss: `start` remains the first slot's action in every state where it is the meaningful
  one, and unpausing is what a paused container needs.
- **Labels change case, and that is real work.** The row's buttons are labelled today from the action
  id, so they read `stop`, `pause`, `restart`, `kill`, `rm`. REQ-2 and REQ-6 make them `Stop`,
  `Pause`, `Restart`, `Kill`, `Remove`. Four automated checks select these controls by their current
  text — `client/test/unit/containers-screen.test.tsx`, `client/e2e/containers.spec.ts`,
  `client/e2e/container-create-run.spec.ts`, `client/e2e/exclusive/prune.spec.ts` — and INT-8, INT-10
  and INT-11 own updating them. `client/e2e/image-transport.spec.ts` and
  `client/test/unit/container-detail-panel.test.tsx` own the moved "Export filesystem…".
- **The menu escapes its scroll container.** The library has no portal today: the `Combobox` popup is
  positioned inside its own field, which is enough inside a form and is not enough inside a
  virtualised, scrolled `DataTable`. REQ-15 therefore needs the menu rendered outside the table's
  overflow and positioned against the trigger's box. Whether an ancestor scroll repositions the menu
  or closes it is the implementer's call — both satisfy REQ-13 and REQ-16, and closing is the
  cheaper and safer one when `DataTable` virtualisation unmounts the row under an open menu.
- **`ActionButtonGroup` is extended, not duplicated.** It is already the library's dense per-row
  action group, it already stops click propagation so a row action never also opens the detail panel,
  and it already refuses to wrap. The overflow control belongs in it as a trailing slot rather than
  beside it, so the four controls are one group with one set of rules — and the images screen, queued
  separately, gets the same arrangement without re-deciding it. `Menu` itself stays standalone and
  domain-agnostic (REQ-17) and stops propagation on its own trigger, so it is equally usable outside
  a row.
- **Nothing server-side is touched.** No endpoint, no service, no Docker call changes; `renameContainer`,
  the lifecycle calls, the transfer client and `triggerDownload` are all reused as they are. The
  change is entirely inside `client/src/ui/`, `client/src/containers/`, the two test trees and the
  documentation named above.
- **The test runs belong to this session, and they are batch-scoped.** The human is out of office and
  has delegated them; the machine is held for the duration, so the daemon is not contended and the
  concurrent-run hazard that normally reserves the suite for the human does not apply here. During
  this batch the tester runs the **batch-scoped** checks — `npm run lint`, `npm run test -w client`,
  and the e2e specs this batch touches (`containers.spec.ts`, `container-create-run.spec.ts`,
  `image-transport.spec.ts`, and `exclusive/prune.spec.ts` in its own project) — and **not** the full
  suite. The full unit suite and the complete e2e suite are run once at the end, after every item of
  `bugs.md` has been certified; change-1 is the first of six and is not that end. No server pass is
  in this batch's scope: nothing server-side is touched.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` (which is current) and `CLAUDE.md`: `client/src/ui/` is the only place allowed raw
  DOM tags and CSS, everything else under `client/src/` composes it.

## Departures from the spec

None. The two decisions taken at the requirements gate — the menu reusing `.ui-overlay-glass` rather
than joining the enforced allow-list under a selector of its own, and rename keeping its inline
editor — refine the spec rather than contradict it; the spec leaves both open, requiring only that
the overlay treatment be an explicit decision and that rename's entry point be the only thing that
moves. `Duplicate config` is absent by requirement (REQ-6), which is the spec's own instruction, not
a departure from it.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside this batch — there is only
one, so nothing is split across batches.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-3, INT-5 |
| REQ-2 | 1 | INT-5 |
| REQ-3 | 1 | INT-3, INT-5 |
| REQ-4 | 1 | INT-3, INT-5 |
| REQ-5 | 1 | INT-3, INT-5 |
| REQ-6 | 1 | INT-5 |
| REQ-7 | 1 | INT-1, INT-5 |
| REQ-8 | 1 | INT-1, INT-5 |
| REQ-9 | 1 | INT-1, INT-5 |
| REQ-10 | 1 | INT-1 |
| REQ-11 | 1 | INT-1 |
| REQ-12 | 1 | INT-1 |
| REQ-13 | 1 | INT-1 |
| REQ-14 | 1 | INT-1, INT-5 |
| REQ-15 | 1 | INT-1 |
| REQ-16 | 1 | INT-1, INT-5 |
| REQ-17 | 1 | INT-1, INT-4 |
| REQ-18 | 1 | INT-5 |
| REQ-19 | 1 | INT-6 |
| REQ-20 | 1 | INT-5, INT-6 |
| REQ-21 | 1 | INT-5, INT-6 |
| REQ-22 | 1 | INT-5 |
| REQ-23 | 1 | INT-7, INT-8, INT-9, INT-10, INT-11 |
| REQ-24 | 1 | INT-5, INT-10 |
| REQ-25 | 1 | INT-1, INT-2, INT-3, INT-5 |
| REQ-26 | 1 | INT-1, INT-2 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none — the
library component (INT-1) would have been the candidate, but it carries REQ-10 to REQ-17 in its own
right, since those requirements are about the affordance rather than about containers.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-25, REQ-26 |
| INT-2 | REQ-25, REQ-26 |
| INT-3 | REQ-1, REQ-3, REQ-4, REQ-5, REQ-25 |
| INT-4 | REQ-17 |
| INT-5 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-14, REQ-16, REQ-18, REQ-20, REQ-21, REQ-22, REQ-24, REQ-25 |
| INT-6 | REQ-19, REQ-20, REQ-21 |
| INT-7 | REQ-23 |
| INT-8 | REQ-23 |
| INT-9 | REQ-23 |
| INT-10 | REQ-23, REQ-24 |
| INT-11 | REQ-23 |

**Three notes on the shape of that mapping**, all deliberate:

- **INT-5 serves seventeen REQs** because the containers row is one place in one component: the four
  slots, their state matrix, the menu's contents and the four operations behind them cannot be
  written in separate files. They stay separate requirements because each fails independently — a row
  can have the right four slots and the wrong menu order, or the right menu and a lost confirmation.
- **REQ-20, REQ-21 and REQ-24 are preservation requirements.** No intervention adds them; INT-5 and
  INT-6 are where they are kept true, and INT-10 is where they are checked. A requirement whose whole
  content is "this must still hold afterwards" is closed by the work that holds it and the check that
  says so.
- **REQ-25's blur half is closed by an untouched file.** `client/scripts/check-ui-conformance.mjs`
  already fails any runtime blur outside the allow-list, so "no per-row surface computes a backdrop
  filter" is enforced precisely by INT-2 leaving that script alone while INT-1 reuses
  `.ui-overlay-glass`. That is why INT-2 exists as an intervention rather than as a note.
