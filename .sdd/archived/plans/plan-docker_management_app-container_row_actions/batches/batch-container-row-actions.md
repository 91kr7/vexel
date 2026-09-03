---
batch: 1 · container-row-actions
feature: F1 — Container row actions: three on the row, the rest in an overflow menu
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26]
depends: []
---

# Batch 1 — Container row actions

The containers list keeps three lifecycle actions on the row and moves the rest — rename, export
filesystem, kill, remove — behind one overflow control at the end of it. The interface has no menu
affordance today, so the batch starts in the UI library and only then touches the screen.

Requirements are cited by id; their text is in
[`requirements.md`](../requirements.md). Do not restate it here.

## What is already true, and must stay true

Read before starting; these are the facts the interventions are written against.

- **The row today** (`.sdd/modules/containers/specs/containers-screen.md`): the lifecycle group is
  variable and labelled from the action id, so it reads in lower case — running → `stop, pause,
  restart, kill, rm`; paused → `start, unpause, restart, kill, rm`; restarting → `kill, rm`;
  created/exited/dead/removing → `start, rm`. Non-destructive actions run immediately through
  `useProgress().run` and re-read the list; `kill` and `rm` go through `useConfirmation().confirm()`
  first; failures report the daemon's own message through `useErrorReporter()`. A row's actions
  disable while that row's own action is in flight.
- **Rename today**: an `IconButton` labelled `Rename <name>` on the name cell, revealed on hover or
  focus but always reachable by keyboard, calling `startRename`, which replaces the cell with a
  pre-filled `TextField` plus "Save name" / "Cancel rename" icon buttons. Submitting an unchanged or
  empty value is a no-op.
- **Export filesystem today** (`.sdd/modules/containers/specs/container-detail-panel.md`): a
  "Export filesystem…" header action on `DetailPanel`, triggering a browser download of
  `<container name>.tar` through the container transfer client and `triggerDownload`, and reporting a
  "Download started" toast. It is the panel's only header action.
- **Selecting a row** anywhere outside its action buttons opens the detail panel.
  `ActionButtonGroup` stops click propagation so an action never also selects the row; anything new
  in that cell must do the same.
- **The blur policy** (`CLAUDE.md`, `.sdd/modules/ui-library/specs/overlay-glass.md`): one runtime
  blur value, one allow-list, and it is closed. This batch adds no selector to it — see INT-2.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`), controls area | The menu affordance the interface does not have: a generic, domain-agnostic component that takes a list of entries — each with a text label, an optional secondary hint shown alongside it, an optional destructive tone, an optional separation from the entries above it, an optional disabled state carrying the reason it is disabled, and a handler — and renders its own trigger plus the popup. **No Docker vocabulary, no data fetching, no knowledge of what an entry does** (REQ-17). Obligations: every entry has a real text label, none is icon-only (REQ-10); the trigger carries an accessible name and announces that it opens a menu and whether it is open, so it reads as "there is more here" rather than as decoration (REQ-11); the conventional keyboard model — the trigger is one stop in tab order and opens from the keyboard, focus moves into the menu, the arrow keys move between entries, an entry activates, `Escape` closes (REQ-12); choosing an entry, `Escape` or a click outside all close it and return focus to the trigger (REQ-13); at most one menu is open in the whole interface at a time, so opening one closes any other (REQ-14); the popup is rendered **outside the scroll and overflow ancestors of its trigger** and positioned against the trigger's box, flipping when there is no room below, so it is never clipped by a table, a panel or a scroll container (REQ-15) — the library has no portal today and the `Combobox` popup is not a precedent for this, being positioned inside its own field; if the trigger scrolls out of view or is unmounted (`DataTable` virtualises rows) the menu closes rather than floating free (REQ-16); the trigger stops click propagation, so opening a menu inside a table row never also selects the row. The surface is a `Surface` asked for `material="overlay"` — the existing material, nothing new: see INT-2 (REQ-25, REQ-26). A destructive entry, a hint and a disabled entry all stay legible on it (REQ-26). Any geometry, radius or z-index value it needs is a token in `client/src/ui/tokens.css`, never a literal; its CSS lives in the library, as all CSS does. Record it with its own component spec under `.sdd/modules/ui-library/specs/` and its row in `.sdd/modules/ui-library/index.md`. | REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-25, REQ-26 | — |
| INT-2 | modify | `CLAUDE.md` (the `backdrop-filter` allow-list table), `client/src/ui/glass/overlay-glass.css` (its header comment), `.sdd/modules/ui-library/specs/overlay-glass.md` | Record the product decision that the menu carries the existing overlay material. The `.ui-overlay-glass` row of the allow-list table enumerates the surfaces that ask for `material="overlay"` (today: the dialog surfaces and the toasts) — it must now name the menu, **together with the cap that makes it legal**: REQ-14 holds the count of open menus at exactly one, which is the criterion `CLAUDE.md` states for admitting a surface. The same enumeration appears in the css file's header comment and in the spec's Contract; keep the three in step. **`client/scripts/check-ui-conformance.mjs` is deliberately not edited**: no selector is added to `blurAllowedOverlaySelectors`, no `.ui-menu…` rule declares a blur, no second blur value is introduced, and the blur stays where it already is — on `.ui-overlay-glass::before`, never on a surface element, which is the nested-backdrop-root failure that spec records and that a popup opening over a dialog is the exact shape of. **If you find yourself wanting to add a selector to that script, you have stopped reusing the material and invented a second one: stop and ask.** The per-row trigger blurs nothing (REQ-25). | REQ-25, REQ-26 | INT-1 |
| INT-3 | modify | `client/src/ui/controls/ActionButtonGroup.tsx` and its stylesheet in the library | Two additions, both generic. First, an action may state **why** it is disabled, so a greyed control is legible as "not now, because…" rather than as broken (REQ-4) — the group already accepts `disabled`, it just says nothing about the cause. Second, an optional **trailing overflow menu**: the group renders INT-1's menu as its last slot, so a row's four controls are one group with the rules the group already owns — click propagation stopped, never wrapping to a second line — and so the overflow control always sits in the same final position (REQ-1, REQ-5). Extend this component rather than adding a near-duplicate or composing the menu beside the group in feature code: it is already the library's dense per-row action group, and the images screen (a separate request) will want the same arrangement. The disabled state itself is untouched (REQ-3). No blur, no overlay material anywhere in this component — it exists once per row (REQ-25). Update its spec. | REQ-1, REQ-3, REQ-4, REQ-5, REQ-25 | INT-1 |
| INT-4 | modify | `client/src/ui/index.ts` | Re-export the menu component and its entry type from the library's public entry point, so feature code imports it from the one path it is allowed to import from. Nothing in `client/src/containers/` may reference the component's own module (REQ-17). Update `.sdd/modules/ui-library/specs/library-entry-point.md`. | REQ-17 | INT-1 |
| INT-5 | modify | `client/src/containers/ContainersScreen.tsx` | The row's action area becomes four controls and nothing else, and no other action-bearing control remains anywhere on the row (REQ-1). Three lifecycle slots, fixed in number, order and position on every row and in every state (REQ-2): first the state-appropriate run/halt action, second `Pause`, third `Restart`; then the overflow control, always last (REQ-5). **The legality matrix is today's, re-rendered — an action absent today becomes disabled, never newly legal** (REQ-3), each disabled control stating its reason (REQ-4): running → `Stop`, `Pause`, `Restart` all enabled; paused → `Resume` and `Restart` enabled, `Pause` disabled; created/exited/dead/removing → `Start` enabled, `Pause` and `Restart` disabled; restarting → all three disabled, the first slot reading `Stop`. Labels take their human-readable form (`Stop`, `Start`, `Resume`, `Pause`, `Restart`), not the action id. On a paused container the first slot carries `Resume` alone; the `start` button the paused row also carries today is not carried over — same intent, one control, as the target screenshot draws. The overflow menu lists exactly four entries in this order and nothing else — `Rename…`, `Export filesystem…`, `Kill`, `Remove`, **no `Duplicate config`**, which exists in the screenshot and nowhere in this product (REQ-6) — with `Kill` and `Remove` in the destructive tone and set apart as a group from the two above them (REQ-7), carrying `SIGKILL` and `rm` as their secondary hints (REQ-8), and with the four entries always present in the same order whatever the state, an inapplicable one disabled with its reason (REQ-9): `Kill` is enabled for running, paused and restarting and disabled elsewhere; `Remove`, `Rename…` and `Export filesystem…` are enabled in every state, as they are today. `Rename…` calls the existing `startRename`, and **the pencil `IconButton` on the name cell is deleted** — the inline editor, its save/cancel controls and its no-op on an unchanged or empty value are otherwise untouched (REQ-18, REQ-21). `Export filesystem…` moves here from the detail panel with its behaviour intact: the container transfer client, `triggerDownload` of `<container name>.tar` and the "Download started" toast (REQ-20, REQ-21). `Kill` and `Remove` keep `useConfirmation().confirm()` exactly as it is — the menu is an added step in front of the confirmation, never a substitute for it (REQ-22) — and every action keeps `useProgress().run`, the list re-read on completion, `useErrorReporter()` on failure, and the disabling of the row's controls while that row's action is in flight (REQ-21). The open menu is tracked by container **id**, not by row index: the entries' handlers are bound to that id, and when that container leaves the list the menu closes (REQ-14, REQ-16). **Do not pause, throttle or debounce the list's re-reads while a menu is open** (REQ-24). Composition only — no raw DOM tag, no CSS, no `style`/`className`, no hard-coded colour or spacing (REQ-25). Update `.sdd/modules/containers/specs/containers-screen.md`, including its dependency list, which gains the menu and the transfer client. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-14, REQ-16, REQ-18, REQ-20, REQ-21, REQ-22, REQ-24, REQ-25 | INT-3, INT-4 |
| INT-6 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Remove the "Export filesystem…" header action and the transfer-client / `triggerDownload` / toast wiring behind it; it lives on the row now (REQ-19). **The header's action slot is left empty on purpose** — it was that panel's only action and nothing replaces it; say so in a comment on the spot so nobody downstream reads the emptiness as an omission. If `DetailPanel`'s actions slot turns out to be a required prop, make it optional in the library rather than passing an empty group from feature code. Nothing else about the panel changes: tabs, config editing, the recreate confirmation and the inspect payload are all untouched (REQ-21), and the export itself is not lost, only moved (REQ-20). Update `.sdd/modules/containers/specs/container-detail-panel.md` and, if the prop changes, `specs/detail-panel.md`. | REQ-19, REQ-20, REQ-21 | INT-5 |
| INT-7 | create | client unit test tree (`client/test/unit/`) | A unit test for the menu component covering what belongs to the affordance rather than to containers: entries render with their labels and hints in the order given, a destructive entry is marked and separated, a disabled entry is inert and exposes its reason, the trigger announces that it opens a menu and whether it is open, the keyboard model works end to end (open, arrow between entries, activate, `Escape`), choosing an entry and clicking outside both close it and return focus to the trigger, and opening a second menu closes the first (REQ-10 to REQ-14). | REQ-23 | INT-1 |
| INT-8 | modify | `client/test/unit/containers-screen.test.tsx` | The row's controls are renamed (`stop` → `Stop`, `rm` → `Remove`, …) and four of them have moved behind the overflow control, so this file's selectors no longer resolve. **Rewrite each assertion to reach the same operation through its new entry point; delete none of them** — a check dropped because its button is gone is exactly the silent capability loss this change risks (REQ-23). Add what the new arrangement asserts: four slots in fixed order and position across the states of the matrix in INT-5, the inapplicable ones disabled with a reason, the menu's four entries in order with their tones and hints, `Rename…` opening the same inline editor the pencil opened, and the pencil being gone. | REQ-23 | INT-5 |
| INT-9 | modify | `client/test/unit/container-detail-panel.test.tsx` | The panel's "Export filesystem…" assertions move rather than disappear: assert here that the panel no longer offers it (and that nothing replaced it), the download behaviour itself being asserted where the action now lives (REQ-23). | REQ-23 | INT-6 |
| INT-10 | modify | `client/e2e/containers.spec.ts` | The spec that drives this screen against the real daemon. Re-point every existing lifecycle, rename and removal assertion at the new entry points, deleting none (REQ-23), and cover what only a browser against a live list can show: opening a row's `…` and reading its four entries in order; `Escape`, an outside click and choosing an entry each closing it with focus back on the trigger; opening a second row's menu closing the first; a menu opened on the last row of a list long enough to scroll being fully visible rather than clipped by the table (REQ-15); clicking `…` not opening the row's detail panel; and the list still updating from daemon events while a menu is open, with the menu never acting on a container other than the one it was opened for (REQ-16, REQ-24). Test rules apply without exception: the spec creates its own containers, carries the ownership labels, removes them with `docker rm -fv` in a `finally`, asserts on its own fixtures rather than on totals or emptiness, and passes when run on its own. | REQ-23, REQ-24 | INT-5 |
| INT-11 | modify | `client/e2e/container-create-run.spec.ts`, `client/e2e/exclusive/prune.spec.ts`, `client/e2e/image-transport.spec.ts` | The remaining specs that reach a container row's controls. The first two select row buttons by their lower-case labels (`stop`, `kill`, `rm`) and need the new labels or the new entry points; the third drives "Export filesystem…" from the detail panel and must drive it from the row's menu instead. Selector updates only — no assertion is weakened, skipped or removed, and none of these specs changes what it was testing (REQ-23). | REQ-23 | INT-5 |

## Order

`INT-1` → `INT-2`, `INT-3`, `INT-4`, `INT-7` → `INT-5` → `INT-6`, `INT-8`, `INT-10`, `INT-11` →
`INT-9`. The library first, always: the affordance exists, is exported and is tested before any
feature code imports it. That is the project's rule, not a preference — inlining it "just here, for
now" is what would guarantee two incompatible menus by the time the images screen needs one.

## Out of this batch

From the spec's own Scope, and not to be drifted into: `Duplicate config` (in the screenshot, absent
from the product, absent from this change); any change to what an action does, to its confirmation,
to its feedback or to the API behind it; the same reorganisation on any other screen — images,
volumes, networks, Compose, Swarm and the rest keep their current arrangement until asked for
separately, even though they will reuse the affordance built here, and **the affordance must not be
designed around their requirements**; anything else about the container detail panel, including its
close affordance; multi-select or bulk actions; new per-container operations; changes to the list's
columns, sorting, filtering or expansion, or to the screen's toolbar; keyboard shortcuts outside the
menu itself; any redesign of the glass material beyond the menu surface reusing it. No server code,
no endpoint, no Docker call is touched.

## Human acceptance

On the Containers screen, every row ends with exactly four controls: a run/halt action (`Stop`
running, `Start` stopped, `Resume` paused), `Pause`, `Restart` and a `…` — in that order, in the same
positions, on every row and in every state, the inapplicable ones present and greyed and each stating
why (a stopped container shows `Pause` and `Restart` inert). The name cell no longer carries a
pencil. Opening a row's `…` shows exactly four entries in this order: `Rename…`,
`Export filesystem…`, then, set apart and in the destructive tone, `Kill` with `SIGKILL` beside it
and `Remove` with `rm` beside it — and no `Duplicate config`. Opening another row's `…` closes the
first. `Escape`, a click outside and choosing an entry all close it and put focus back on the `…`.
`Tab` reaches the `…`, `Enter` opens it, the arrow keys walk the entries, `Enter` runs one. Opening
the `…` on the last row of a list long enough to scroll shows the whole menu, unclipped, and clicking
it does not open the row's detail panel. `Rename…` starts the same inline name editor the pencil
started, with the same save and cancel; `Export filesystem…` downloads `<name>.tar` and toasts
"Download started"; `Kill` and `Remove` still open exactly the confirmation they opened before, and
cancelling still does nothing. The container detail panel no longer offers "Export filesystem…" and
offers nothing in its place. Stopping a container from a terminal while its menu is open updates the
row as promptly as before, and the menu either follows that container or closes — it never acts on
another one. `npm run lint`, `npm run test -w client` and this batch's own e2e specs
(`containers.spec.ts`, `container-create-run.spec.ts`, `image-transport.spec.ts`, and
`exclusive/prune.spec.ts` in its own project) pass, with `client/scripts/check-ui-conformance.mjs`
unmodified, and the specs that used to click `stop`, `kill` or `rm` on a row now reach those same
operations through their new entry points rather than having been deleted. The full unit suite and
the complete e2e suite are not this batch's business: they run once at the end, after every item of
`bugs.md` has been certified.
