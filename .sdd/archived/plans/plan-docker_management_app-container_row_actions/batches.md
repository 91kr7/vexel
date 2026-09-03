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
| 1 · container-row-actions | F1 — Container row actions: three on the row, the rest in an overflow menu | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26 | — | certified | On the Containers screen, every row ends with exactly four controls: a run/halt action (`Stop` running, `Start` stopped, `Resume` paused), `Pause`, `Restart`, and a `…` control — in that order, in the same positions, on every row and in every state, with the inapplicable ones present and greyed and each stating why (a stopped container shows `Pause` and `Restart` inert). The name cell no longer carries a pencil. Opening a row's `…` shows exactly four entries in this order: `Rename…`, `Export filesystem…`, then, set apart and in the destructive tone, `Kill` with `SIGKILL` beside it and `Remove` with `rm` beside it — and no `Duplicate config`. Opening another row's `…` closes the first. `Escape`, a click outside and choosing an entry all close it and put focus back on the `…`. `Tab` reaches the `…`, `Enter` opens it, the arrow keys walk the entries, `Enter` runs one. Opening the `…` on the last row of a list long enough to scroll shows the whole menu, unclipped, and clicking it does not open the row's detail panel. `Rename…` starts the same inline name editor the pencil started, with the same save/cancel; `Export filesystem…` downloads `<name>.tar` and toasts "Download started"; `Kill` and `Remove` still open exactly the confirmation they opened before, and cancelling still does nothing. The container detail panel no longer offers "Export filesystem…" and offers nothing in its place. Stopping a container from a terminal while its menu is open updates the row as promptly as before and the menu either follows that container or closes — it never acts on another one. `npm run lint`, `npm run test -w client` (the UI conformance check included, with `client/scripts/check-ui-conformance.mjs` unmodified) and this batch's e2e specs pass, and the specs that used to click `stop`/`kill`/`rm` on a row now reach the same operations through their new entry points rather than having been deleted. |

| 2 · menu-follows-its-control | F2 — An open menu follows its control instead of closing on any scroll | REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33 | — | certified | The menu stays open while the list keeps moving underneath it |

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

## Appended on 2026-08-31 — one batch

**The overflow menu closes itself an instant after it opens**, so the operator presses `…` on a
container card and sees nothing. Three checks of one end-to-end run failed on 2026-08-31 with that
signature, all in `client/e2e/containers.spec.ts`; the traces show the press landing and completing,
then the wait for the menu spending its whole budget on an element that is not there, with the card and
its trigger still on the page. The cause is a capture-phase `scroll` listener held while a menu is
open: **any** scroll event from any container of the page closes it, and the Containers screen produces
them by itself — the card region scrolls, the list is read again every three seconds and on every
daemon event, the grid changes height as containers come and go, and bringing a control into view
before pressing it is itself a scroll, whose event arrives after the press. The batch below closes it.

Per [[past-analyses-and-plans-are-never-touched]], work found after a batch is appended as a further
batch and never edited into one already closed: **nothing above this line was changed**, beyond the one
row added to the batch table and its seven coverage rows. Batch 1 is not reopened, and none of its
requirements is contradicted — REQ-13 names the three dismissals a menu has and a scroll is not among
them, and REQ-16 leaves "stays with that container or closes" open, which this narrows rather than
reverses.

**Execution order.** `menu-follows-its-control` depends on nothing still open in this plan. It changes
the `Menu` component built by batch 1, which is certified; it needs that work present, not repeated.
The `Depends` column is empty for that reason.

### Assumptions and decisions

- **A scroll repositions the popup; it no longer closes the menu.** The reason written into today's
  contract — a scroll carries the trigger out from under a popup left standing — is right, and closing
  is the wrong price for it. The popup is `position: fixed` on `document.body`, outside every scrolling
  ancestor, and the component already recomputes its placement against the trigger's box after every
  render, bailing out when nothing moved. A scroll produces no render, which is the whole reason the
  listener exists; so the scroll path calls that same placement routine.
- **The closing condition becomes "the trigger has gone", not "a scroll happened".** Entirely out of
  the visible area left to it by whatever clips it, or unmounted. A rectangle against the viewport is
  not that test: it is the card region that clips the trigger, not the screen.
- **Entirely out, not partly out**, with the cost named: while a card is half under the header its open
  popup overlaps the header. A partial-clip threshold would restore a hair trigger differing from
  today's only in how many pixels of scroll it takes.
- **A resize still closes the menu.** It is always a deliberate gesture, never something the list does
  under the operator three times a second, and it changes every geometry at once — the navigation rail
  docks and undocks at the phone breakpoint. The unit case asserting it stays exactly as written, as
  does the one asserting that an unmounted trigger takes its popup with it.
- **The focus hypothesis is excluded as the cause and closed by a check.** Opening focuses the first
  entry with a bare `focus()`, and focus on a partly visible element makes a browser scroll — the shape
  of `CLAUDE.md`'s `bug-2`. It is unlikely here (the popup is fixed and clamped inside the viewport, so
  there is nothing to scroll into view), a blanket `preventScroll` would be a regression of its own
  (the last entry stranded when a menu reaches its height cap), and after this change a focus-induced
  scroll could not close a menu anyway. REQ-30 replaces the argument with an observation, and names the
  bounded repair if it ever goes red.
- **The retry helper keeps its second half and loses its licence.**
  `client/e2e/support/row-overflow-menu.ts` was written against this dismissal and calls it "the
  contract, not a flake". One dismissal outlives the change — the trigger's row replaced under the
  gesture — so the helper stays; what it may no longer absorb is a menu gone while its trigger stayed
  where it was, which is the repaired defect and must fail the check. Its refusal to press an
  already-activated destructive entry a second time is untouched.
- **The images screen is repaired without an intervention of its own.** It uses the same overflow slot
  of `ActionButtonGroup`, so the fix reaches it through the library, which is what the library is for.
- **No debt entry is opened or closed.** This is a defect being fixed now, not a cost being deferred.

### Departures

- **The two validation gates were not held.** The human was unavailable and the orchestrator validated
  in their place, on the report of 2026-08-31: the requirements and the coverage below were written and
  not put back for validation. The one decision left open by the report — reposition or something else
  — was taken here and is argued in the batch file, together with the second hypothesis it excludes.
  Nothing here is an open question.
- **No departure from the business spec.**
  `.sdd/analysis/docker_management_app-container_row_actions.md` asks for a menu that opens on a
  control and closes on a dismissal; it never says a scroll is one. Nothing here contradicts it and no
  correction to it is owed. **The component spec is a different matter and the batch owes it a
  correction**: `.sdd/modules/ui-library/specs/menu.md` states, under "Rules and invariants", that a
  scroll anywhere between the trigger and the viewport closes the menu. After this batch that is false.
  `INT-4` carries the change, per [[every-change-updates-spec-requirements-plan]]. That is
  spec-carrying work, not a departure.
- **The run is the batch's perimeter, not a full pass.** `npm run lint`, `npm run test -w client` (the
  UI conformance check included, with `client/scripts/check-ui-conformance.mjs` unmodified), and
  `client/e2e/containers.spec.ts` — which holds both the three failing cases and the three new ones.
  Batch 1's other e2e specs are re-run only if they touch a row's overflow menu through the helper
  changed by INT-10 (`container-create-privileged.spec.ts`, `layer-build-cache.spec.ts`), and no
  server pass is in scope: nothing server-side is touched.

### Coverage check — the appended requirements

Every appended REQ is served by at least one INT, every INT of the appended batch serves at least one
REQ, no appended REQ is split across batches — all seven close in `menu-follows-its-control` — and there
is no enabling intervention.

| REQ | Served by | Closes in |
| --- | --- | --- |
| REQ-27 | `batch-menu-follows-its-control/INT-1`, `/INT-4`, `/INT-5`, `/INT-7`, `/INT-11` | menu-follows-its-control |
| REQ-28 | `batch-menu-follows-its-control/INT-1`, `/INT-4`, `/INT-5`, `/INT-7` | menu-follows-its-control |
| REQ-29 | `batch-menu-follows-its-control/INT-2`, `/INT-4`, `/INT-8` | menu-follows-its-control |
| REQ-30 | `batch-menu-follows-its-control/INT-3`, `/INT-9` | menu-follows-its-control |
| REQ-31 | `batch-menu-follows-its-control/INT-1`, `/INT-6` | menu-follows-its-control |
| REQ-32 | `batch-menu-follows-its-control/INT-7`, `/INT-8`, `/INT-9`, `/INT-11` | menu-follows-its-control |
| REQ-33 | `batch-menu-follows-its-control/INT-10`, `/INT-11` | menu-follows-its-control |

Three notes on it.

- **One check fails on the product as it stands, and the batch says which.** `INT-7` — the wheel scroll
  with the menu open — goes red today, because today's first scroll event closes the menu. `INT-8` and
  `INT-9` pass before the change as well: the first is the guard against the repair overshooting into a
  popup that never closes, the second is the second hypothesis made falsifiable. A green run of either
  proves nothing about the defect, which is why it is written down.
- **REQ-31 is what stops the repair being paid for by the main view.** A popup following its trigger is
  work on every scroll frame, and an implementation re-rendering the list under it would hand back, on
  the longest list in the product, what `CLAUDE.md`'s background and blur rules exist to protect.
  `INT-6` counts it rather than trusting it.
- **REQ-33 is the requirement that keeps the next regression visible.** A retry loop that survives the
  cause it was written for turns the return of this defect into a slower green run. `INT-10` narrows
  it to the dismissal that still exists.
