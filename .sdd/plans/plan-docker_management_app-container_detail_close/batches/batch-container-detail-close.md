---
batch: 1 · container-detail-close
feature: F1 — The container detail panel closes by its row, not by a `✕`
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19]
depends: []
---

# Batch 1 — The container detail panel closes by its row, not by a `✕`

The container detail panel loses its `✕`. What replaces it is not another control: the row that
opened the panel closes it, and `Escape` closes it from the keyboard. The shared library panel
therefore gains a presentation variant rather than the containers screen gaining a panel of its own,
and the library gains one place that decides who an `Escape` belongs to — because the row overflow
menu, the dialogs and a live terminal all want that key too.

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not
restate it here.

## What is already true, and must stay true

Read before starting; these are the facts the interventions are written against, checked in the
indexes, the component specs and — where a spec could not settle it — the code itself.

- **The `✕` today** (`client/src/ui/glass/DetailPanel.tsx`): an `IconButton` with the accessible name
  **`Close detail`**, rendered unconditionally in a `.ui-detail-panel__close` wrapper above the
  header, calling the required `onClose` prop. Every consumer of `DetailPanel` gets it, always.
- **`DetailPanel` has exactly two consumers**: `client/src/containers/ContainerDetailPanel.tsx` and
  the images screen's inspect panel. Only the first one changes here (REQ-14).
- **The panel's action slot is already empty** (change-1, merged): `Export filesystem…` moved to the
  row's overflow menu, and `container-detail-panel.test.tsx` already asserts that nothing replaced
  it. Removing the `✕` empties that whole area — intended, and not an omission to fill.
- **Row selection today** (`.sdd/modules/containers/specs/containers-screen.md`): selecting a row
  anywhere outside its action controls opens the panel inline below it; selecting the same row again
  closes it; **a selected container removed from the daemon already closes its panel**; a selected
  container merely filtered out of view **stays selected and its panel reappears when the filter
  changes back**. Both of those are correct as they stand and are preserved, not changed: the panel
  is the table's `renderExpanded` content, keyed to `expandedRowKey`, so it renders in normal flow
  directly beneath its own row — when the row is not rendered, neither is the panel. A filtered-out
  selection is therefore a retained selection with nothing on screen, not a panel with no way out.
  **This batch's only behaviour changes are the `✕` disappearing and `Escape` arriving.**
- **`Escape` already has claimants, and one of them is document-level.**
  `client/src/ui/controls/Menu.tsx` (the effect at ~line 172) binds `keydown` **on the document**
  while a menu is open, calls `preventDefault()` and closes. It was written that way deliberately, to
  fix a real defect: a menu can lose the focus and must still close. `client/src/ui/layout/Frame.tsx`
  (~line 59) does the same for the phone navigation drawer; `client/src/ui/controls/Combobox.tsx`
  (~line 77) closes its popup from its own field. **Nothing else in `client/src/` handles `Escape`** —
  in particular `Modal`, `ConfirmDialog`, `FormDialog`, `FormSheet` and `TransferProgressDialog` do
  not close on it today, and this batch does not give them that (REQ-9 is about the panel *not*
  closing behind them, nothing more).
- **A second document-level listener would be a race, not an arbitration.** Two independent document
  listeners both fire for one keystroke, and which runs first is the order they were registered in —
  i.e. whether the panel or the menu opened first. `event.defaultPrevented` does not save it either:
  a panel opened before the menu is called first and closes before `Menu` ever sees the key. This is
  why INT-1 exists rather than "add a `keydown` handler to the panel".
- **A terminal legitimately receives `Escape`.** The Exec and Attach tabs mount
  `client/src/ui/terminal/Terminal.tsx` (xterm.js, the documented `CLAUDE.md` escape hatch). Its
  keystrokes bubble to the document like any other, so a document-level panel listener *will* see
  them unless something stops it. A session that quietly stops receiving `Escape` looks like a
  working session: this is the one way this batch can break something unrelated to it.
- **No existing check closes the container detail panel by clicking the `✕`.** The whole repository
  contains exactly one `Close detail` click — `client/e2e/filesystem-browser.spec.ts:160`, on the
  **images** panel, which keeps its control and whose spec must keep passing untouched. So there is
  nothing to rewrite for the container panel and, more importantly, **nothing covers its dismissal
  at all today**: `containers.spec.ts` opens the panel and never closes it,
  `containers-screen.test.tsx` does not exercise selection at all. The coverage REQ-19 protects has
  to be created here, not preserved.
- **The blur policy** (`CLAUDE.md`, `.sdd/modules/ui-library/specs/overlay-glass.md`): closed
  allow-list, one blur value. This batch adds no surface, so
  `client/scripts/check-ui-conformance.mjs` is **not edited**, `blurAllowedOverlaySelectors` gains
  nothing, and the `CLAUDE.md` table gains no row (REQ-18).
- **Rows are not keyboard-operable, and this batch does not change that.** A `DataTable` row is a
  plain `div` with `onClick` and `aria-selected` — no `tabIndex`, no `role`, no `onKeyDown`, no
  `aria-expanded`. Making rows real disclosure controls is a separate request. Do not start it here.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`), the behaviour side of the controls area | The arbitration the library does not have: **one place that decides which surface an `Escape` belongs to**. A dismissible surface registers a claim while it is open and withdraws it when it closes; **one** document-level listener delivers the key to the **innermost claimant only** — the most recently opened one — and to no other, so a single `Escape` never resolves two things at once (REQ-7). A region may also declare that keystrokes typed inside it are **its own**, so an `Escape` whose origin is inside that region is delivered to no claimant at all (REQ-8). With no claimant registered the key is left entirely alone: nothing is prevented, nothing is swallowed (REQ-10). **Do not build this out of listener registration order, `event.defaultPrevented` or a `stopPropagation` race** — all three make the outcome depend on which surface opened first, which is exactly the defect (see "What is already true"). Generic and domain-agnostic: it knows "a claimant" and "a region that owns its keys", never a panel, a menu or a container. Record it with its own component spec under `.sdd/modules/ui-library/specs/` and its row in `.sdd/modules/ui-library/index.md`; export it from `client/src/ui/index.ts` only if a consumer outside the library needs it — no consumer in this batch does. | REQ-5, REQ-7, REQ-8, REQ-9, REQ-10 | — |
| INT-2 | modify | `client/src/ui/controls/Menu.tsx` | The menu's existing document-level `Escape` handling becomes a **claim registered with INT-1** instead of a listener of its own, so an open menu is the innermost claimant and takes the key ahead of any panel underneath it; a second `Escape` then reaches the panel (REQ-7). Everything else about the menu's keyboard model is untouched and must stay exactly as it is: `Tab`, `ArrowUp`/`ArrowDown`, `Home`/`End`, the outside-click dismissal, the focus returning to the trigger, one menu open at a time. The reason the listener was put on the document in the first place — an open menu can lose the focus and must still close — has to survive the change: the claim is not conditional on where the focus sits. Update `.sdd/modules/ui-library/specs/menu.md`. | REQ-7 | INT-1 |
| INT-3 | modify | `client/src/ui/glass/DetailPanel.tsx` and `client/src/ui/glass/detail-panel.css` | Three things, in one component. **(a) The presentation variant** (REQ-13): the panel presents either with its close control or without it, chosen by the consumer through a typed prop, **defaulting to the presentation it has today** so the images screen is untouched by omission (REQ-14). Without the control, the `.ui-detail-panel__close` area is not rendered and reserves no space — no empty box, no orphaned padding where the glyph was (REQ-1, REQ-2). Document **the rule that decides it** on the component and in its spec: *absent where the panel's opening gesture also closes it, present where the close control is the only way out* — and that each new use is a decision to be checked against that rule, not a default to drift into. **(b) `Escape` dismissal** (REQ-5, REQ-6): in the control-less presentation the panel registers a claim with INT-1 while it is mounted and, when the key reaches it, calls the same `onClose` it would have called from the `✕` — from wherever the focus sits inside its body, and only while it is present (REQ-10). The presentation with a close control keeps today's behaviour and claims nothing, so images gains no `Escape` route (REQ-14). **(c) The point of interaction** (REQ-11): on dismissal, hand focus to the nearest enclosing dismissal focus target (INT-4) before the panel unmounts — never leave it on the removed subtree, never let it fall to `<body>`. This component adds no surface, no overlay material and no blur, so `client/scripts/check-ui-conformance.mjs` stays unmodified (REQ-18). Update `.sdd/modules/ui-library/specs/detail-panel.md`. | REQ-1, REQ-2, REQ-5, REQ-6, REQ-11, REQ-13, REQ-14, REQ-18 | INT-1, INT-4 |
| INT-4 | modify | `client/src/ui/data/DataTable.tsx` and `client/src/ui/data/data-table.css` | The list region becomes **programmatically focusable** and marks itself as the dismissal focus target INT-3 hands focus to when a panel inside it closes (REQ-11). `tabIndex={-1}` and nothing else — **it must add no new tab stop**: `Tab` walks the screen exactly as it does today, which is the entire reason for `-1` rather than `0`. Focusing it must produce no visual artefact that reads as a selection: style it through `:focus-visible` so a pointer-driven dismissal shows no ring. The element belongs here, in the library, and **not** in the containers screen, which may emit no markup of its own. Nothing else about the table changes — rows stay exactly as they are, with no `tabIndex`, no `role`, no `onKeyDown` and no `aria-expanded` (that is a separate request, and starting it here is out of scope). Update `.sdd/modules/ui-library/specs/data-table.md`. | REQ-11 | — |
| INT-5 | modify | `client/src/ui/terminal/Terminal.tsx` (or `client/src/ui/terminal/SessionChrome.tsx`, if the surface rather than the emulator is the right host for the declaration) | Declare the terminal's region as **owning its own keystrokes** with INT-1, so an `Escape` typed into a live exec or attach session goes to the session and reaches no claimant — the panel included (REQ-8). **Do not rely on xterm.js calling `preventDefault()`**: the guarantee has to be the library's own and stated in the component's spec, because the failure is silent — a session that stops receiving one key still looks like a working session. Nothing about the emulator, the session lifecycle or the session-ended overlay changes. Update the component's spec under `.sdd/modules/ui-library/specs/`. | REQ-8 | INT-1 |
| INT-6 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Ask the shared panel for the presentation **without** the close control, and for its `Escape` dismissal (REQ-1, REQ-2, REQ-5). `onClose` keeps its contract and its caller: it is now reached by `Escape` and by the row, and no longer by a control on the panel. Say on the spot, in a comment, that the header area is deliberately empty — the export left in change-1, the `✕` leaves here, and nothing replaces either (REQ-2). **Nothing else about this panel changes**: the tabs, the Config edit mode and its recreate confirmation, the inspect payload, the log/stats/processes views and the exec/attach sessions are untouched (REQ-17). Update `.sdd/modules/containers/specs/container-detail-panel.md`. | REQ-1, REQ-2, REQ-5, REQ-14, REQ-17 | INT-3 |
| INT-7 | modify | `client/src/containers/ContainersScreen.tsx` | The row becomes the only pointer route, so what the screen already does here stops being a convenience and becomes a guarantee — **this intervention preserves behaviour, it does not change any**: re-selecting the selected row closes the panel (REQ-3); selecting a different row keeps the panel open and re-points it (REQ-4); a container removed from the daemon closes its panel (REQ-15); a container filtered or searched out of view keeps its selection, renders no row and therefore no panel, and comes back with its panel intact when it re-enters the list (REQ-16). All four hold today; none may be lost while the panel loses its `✕`, and each is asserted for the first time by INT-10 and INT-12. **Do not close the panel when a filter hides its row** — the panel is `renderExpanded` beneath its own row, so nothing is stranded on screen, and discarding the selection would throw away a useful, documented behaviour for no gain. **Do not restyle the row's selected state** (REQ-12): the visible bond is `DataTable`'s existing selected-row treatment plus `aria-selected`, verified here rather than redesigned; increasing its emphasis is a follow-up with its own justification. Composition only — no raw DOM tag, no CSS, no `style`/`className`. `.sdd/modules/containers/specs/containers-screen.md` is correct as written on all of this and needs no correction here. | REQ-3, REQ-4, REQ-12, REQ-15, REQ-16 | INT-6 |
| INT-8 | create | client unit test tree (`client/test/unit/`) | The check for what belongs to the library rather than to containers: the panel renders its close control by default and renders none when the control-less presentation is asked for, with no space reserved where it was; `Escape` dismisses the control-less panel from focus inside its body and does nothing to the presentation that keeps its control; **an open menu takes the `Escape` and the panel stays open, a second `Escape` closes the panel** (REQ-7); an `Escape` originating inside a region that owns its keystrokes reaches no claimant and leaves the panel open (REQ-8); with no claimant registered the key is left alone (REQ-10); and on dismissal the focus lands on the list region, never on `<body>` and never on the removed subtree (REQ-11). Assert the tab order is unchanged by INT-4's focus target. | REQ-5, REQ-6, REQ-7, REQ-8, REQ-10, REQ-11, REQ-13 | INT-3, INT-4, INT-5, INT-2 |
| INT-9 | modify | `client/test/unit/container-detail-panel.test.tsx` | Alongside the existing "puts nothing in the place the export left", assert that the container panel offers **no `Close detail` control** and that `Escape` calls `onClose` (REQ-1, REQ-2, REQ-5). Neither assertion exists today — this is the file where the panel's own presentation is checked, and its "REQ-19" describe block from change-1 is the natural neighbour. | REQ-1, REQ-2, REQ-5, REQ-19 | INT-6 |
| INT-10 | modify | `client/test/unit/containers-screen.test.tsx` | This file exercises the row's controls and **never exercises selection**, which is exactly the coverage the `✕`'s removal makes load-bearing. Add it: selecting a row opens the panel, re-selecting the same row closes it (REQ-3), selecting another row keeps it open on the other container (REQ-4), a container that leaves the list closes it (REQ-15), and a search term or state filter that excludes the selected container renders neither its row nor its panel while keeping the selection, the panel coming back unchanged when the filter is cleared (REQ-16). Delete nothing that is there. | REQ-3, REQ-4, REQ-15, REQ-16, REQ-19 | INT-7 |
| INT-11 | modify | `client/test/unit/images-screen.test.tsx` | One assertion, and it is the cheap guard on the whole variant: the **images** detail panel still offers its `Close detail` control and still closes with it (REQ-14). The file already opens that panel and asserts what it contains; it never checks the close control, so a wrong default in INT-3 would silently strip a control from a screen this change is not allowed to touch. Change nothing else in this file. | REQ-14, REQ-19 | INT-3 |
| INT-12 | modify | `client/e2e/containers.spec.ts` | Against the real daemon, in the browser — the routes only a live list can show. The open panel carries **no `Close detail` control** (REQ-1); re-selecting its row closes it (REQ-3); selecting another row re-points it at that container (REQ-4); `Escape` closes it (REQ-5); with the row's overflow menu open, `Escape` closes **only the menu** and the panel is still there, a second `Escape` closing it (REQ-7); with the `Remove` confirmation open over the screen, `Escape` leaves the panel open — and leaves the confirmation to do whatever it does today, which is nothing (REQ-9); typing a search term that excludes the selected container takes its row and its panel off screen together, and clearing the search brings both back as they were (REQ-16); the owning row is visibly the selected one while its panel is open (REQ-12). Test rules apply without exception: the spec creates its own containers with the ownership labels, removes them with `docker rm -fv` in a `finally`, asserts on its own fixtures rather than on totals or emptiness, and passes when the file is run on its own. Delete nothing that is there. | REQ-1, REQ-3, REQ-4, REQ-5, REQ-7, REQ-9, REQ-12, REQ-16, REQ-19 | INT-7 |
| INT-13 | modify | `client/e2e/container-exec-attach.spec.ts` | The one check that protects the terminal: with a live exec session running in the panel, pressing `Escape` in the terminal **leaves the panel open and the session live**, and the keystroke is observed **reaching the session** rather than being assumed to — instrument the session's own channel, in the way `client/e2e/container-stats-processes.spec.ts` already observes its subscriptions, rather than asserting only that nothing closed (REQ-8). The failure this guards is silent, so an assertion that only proves the panel survived would miss half of it. The file's existing fixtures, cleanup and session teardown stay as they are. | REQ-8, REQ-19 | INT-5, INT-6 |

## Order

`INT-1`, `INT-4` → `INT-2`, `INT-3`, `INT-5` → `INT-6` → `INT-7` → `INT-8`, `INT-9`, `INT-10`,
`INT-11`, `INT-12`, `INT-13`.

The library first, as always. Two notes on why the order is what it is: `INT-2` (the menu joining the
arbitration) must land **with** `INT-3`, not after it — between the two, a single `Escape` closes the
menu *and* the panel, which is a defect shipped in the middle of the batch; and `INT-11` can be
written the moment `INT-3` exists, since its whole job is to catch a wrong default there.

## Out of this batch

From the spec's own Scope, and not to be drifted into: **the images detail panel**, which qualifies
under the same rule and deliberately keeps its `✕` until change-3 reaches it — a regression there
must remain attributable to change-3; **making rows keyboard-operable** (focusable, activatable,
announcing their expanded state), which is the correct eventual repair of a recorded limitation and
is its own request; any other change to the container detail panel, its contents, its layout or what
it can do; any replacement dismissal affordance on the panel; any keyboard shortcut other than
`Escape`; `Escape`-to-cancel on the Config edit form, the inline rename editor or the log search
field — none of them claims the key today and giving one the key is new behaviour nobody asked for;
`Escape`-to-close on `Modal` and everything built on it; any change to the list's columns, sorting,
filtering, selection semantics or toolbar; any change to an operation, its
confirmation, its feedback or the API behind it; and the four remaining items of `bugs.md`. No server
code, no endpoint, no Docker call is touched.

## Human acceptance

On the Containers screen, selecting a container opens its detail panel below the row and **there is
no `✕` anywhere on it** — the header area it shared with `Export filesystem…` is empty, with no gap
or stray padding where the glyph used to sit. Clicking that same row again closes the panel; clicking
a different row leaves the panel open on the other container. With the panel open, `Escape` closes it
— including when the focus is inside the panel, on a tab or a field, reached by `Tab` alone. With a
row's `…` menu open, `Escape` closes only the menu and the panel is still there; pressing it again
closes the panel. With the `Remove` confirmation open, `Escape` leaves both the confirmation and the
panel exactly as they were. In the panel's Exec tab, with a live session, pressing `Escape` in the
terminal sends it to the session and closes nothing. Removing the container from another terminal
closes its panel; typing a search term that hides its row takes the row and the panel off screen
together, and clearing the search brings both back exactly as they were. While a panel is open its
row is visibly the selected one. With no
panel open, `Escape` changes nothing on the screen. On the **Images** screen the detail panel still
has its `✕` and still closes with it — unchanged, deliberately, until change-3. Everything else about
the container panel behaves as before: the same tabs, the same Config edit and its recreate
confirmation, the same inspect payload, the same logs, stats and processes.

**The batch's test runs are batch-scoped**, and the tester runs exactly these: `npm run lint`,
`npm run test:typecheck -w client`, `npm run test -w client` for this batch's unit files
(`container-detail-panel.test.tsx`, `containers-screen.test.tsx`, `images-screen.test.tsx` and the
new library test of INT-8, the UI conformance check included with
`client/scripts/check-ui-conformance.mjs` unmodified), and this batch's e2e specs
(`client/e2e/containers.spec.ts` and `client/e2e/container-exec-attach.spec.ts`). **The full unit
suite and the complete e2e suite are not this batch's business**: they run once at the end, after
every item of `bugs.md` has been certified — change-2 is the second of six and is not that end. No
server pass is in scope: nothing server-side is touched.
