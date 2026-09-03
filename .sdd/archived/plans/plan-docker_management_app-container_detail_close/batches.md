---
slug: docker_management_app-container_detail_close
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-container_detail_close.md
requirements: .sdd/plans/plan-docker_management_app-container_detail_close/requirements.md
status: validated
---

# Batches — The container detail panel closes by its row, not by a `✕`

Evolution of a certified product. One feature, one batch, thirteen interventions. Batch numbers and
`REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · container-detail-close | F1 — The container detail panel closes by its row, not by a `✕` | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19 | — | certified | On the Containers screen, selecting a container opens its detail panel below the row and there is no `✕` anywhere on it — the header area it shared with `Export filesystem…` is empty, with no gap or stray padding where the glyph sat. Clicking that same row again closes the panel; clicking a different row leaves it open on the other container. With the panel open, `Escape` closes it, including when focus is inside the panel on a tab or a field reached by `Tab` alone. With a row's `…` menu open, `Escape` closes only the menu and the panel is still there; pressing it again closes the panel. With the `Remove` confirmation open, `Escape` leaves both the confirmation and the panel exactly as they were. In the Exec tab, with a live session, `Escape` typed in the terminal reaches the session and closes nothing. Removing the container from another terminal closes its panel; typing a search term that hides its row takes the row and the panel off screen together, and clearing the search brings both back exactly as they were. While a panel is open its row is visibly the selected one. With no panel open, `Escape` changes nothing. On the Images screen the detail panel still has its `✕` and still closes with it, deliberately unchanged until change-3. Everything else about the container panel behaves as before: same tabs, same Config edit and recreate confirmation, same inspect payload, same logs, stats and processes. `npm run lint`, `npm run test:typecheck -w client`, this batch's unit files (the UI conformance check included, with `client/scripts/check-ui-conformance.mjs` unmodified) and this batch's e2e specs (`containers.spec.ts`, `container-exec-attach.spec.ts`) pass. The full unit suite and the complete e2e suite are not this batch's business: they run once at the end, after every item of `bugs.md` is certified. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **One batch, and it is not inflatable.** The change is a removal, a variant and a key binding on
  one screen. Splitting the library work from the containers screen would be a split by layer, which
  the batching rule forbids, and neither half is acceptable alone: a panel variant nothing asks for
  has no acceptance criterion, and a panel stripped of its `✕` before `Escape` exists ships the
  accessibility regression the spec exists to prevent.
- **The `Escape` arbitration is a library asset, and it is one mechanism, not two listeners.**
  `Menu.tsx` already binds `keydown` on the document while a menu is open (deliberately, three hours
  ago, to fix a real defect: an open menu can lose the focus and must still close). A second
  document-level listener on the panel would not arbitrate anything — both fire for one keystroke,
  and which wins depends on which surface opened first. `event.defaultPrevented` does not rescue it
  either: a panel opened before the menu runs first and closes before `Menu` sees the key. Hence
  INT-1 (one claim registry, innermost claimant wins) and INT-2 (the menu joins it rather than
  keeping its own listener). **If the implementation finds itself adding a second document-level
  `Escape` listener, it has stopped arbitrating and started racing: stop and come back.**
- **The terminal's claim is declared, not inherited from xterm.** INT-5 marks the terminal region as
  owning its keystrokes rather than trusting the emulator to call `preventDefault()` on `Escape`.
  The failure mode is silent — a session that stops receiving one key still looks alive — so the
  guarantee has to be the library's own and has to be asserted (INT-13).
- **Nothing joins the public entry point unless a consumer outside the library needs it.** The
  arbitration is consumed by `DetailPanel`, `Menu` and `Terminal`, all inside `client/src/ui/`;
  feature code only picks a presentation through a prop on the already-exported `DetailPanel`. No
  new export is planned, and adding one "for later" would put a keyboard mechanism in reach of
  feature code that is not allowed to own one.
- **`Escape` does not cancel an in-progress Config edit, and no new claimant is invented.** Closing
  the panel while the Config tab is in edit mode discards that edit — which is exactly what
  re-clicking the row does today, so `Escape` inherits the existing behaviour rather than a new one.
  The same holds for the inline rename editor and the log-search field: none of them claims `Escape`
  today, and giving one the key would be new behaviour nobody requested.
- **Dialogs still do not close on `Escape`.** `Modal`, `ConfirmDialog`, `FormDialog`, `FormSheet` and
  `TransferProgressDialog` handle no key today. REQ-9 asks only that the panel **not** be dismissed
  behind an open dialog; teaching every dialog in the product a new shortcut is a different change,
  with a different blast radius.
- **A filtered-out selection keeps its panel, and this reverses a gate answer — do not reinstate the
  closing behaviour from that earlier instruction.** The requirements gate answered that a row
  excluded by the search or the state filters should close its panel; the coverage gate reversed it
  once the mechanism was checked, and REQ-16 is now a preservation requirement. **The reason is that
  the hazard does not exist**: the panel is the `DataTable`'s `renderExpanded` content, keyed to
  `expandedRowKey`, and it renders in normal flow directly beneath its own row — when the filter
  excludes the row, the row is not rendered and neither is the panel. There is no panel on screen
  with no way out; there is a retained selection displaying nothing. With the hazard gone, closing on
  a filter would discard a deliberate, documented and useful behaviour (`filter, look, unfilter, and
  the panel is where you left it`, recorded in `.sdd/modules/containers/specs/containers-screen.md`)
  in exchange for nothing, and would make a request to remove one control into the plan's
  second-largest behavioural change. **REQ-15 is untouched**: a container removed from the daemon
  closes its panel, as it already does. The old spec sentence's two halves are now split correctly
  between the two requirements, and both are preservation. After this, the plan's only observable
  changes are the `✕` disappearing and `Escape` arriving.
- **The coverage REQ-19 protects does not exist yet.** Checked across the repository: the only
  `Close detail` click anywhere is `client/e2e/filesystem-browser.spec.ts:160`, on the **images**
  panel, which keeps its control. Nothing closes the *container* panel in any test, by any route —
  `containers.spec.ts` opens it and never closes it, `containers-screen.test.tsx` never exercises
  selection at all. So there is nothing to rewrite and everything to create: INT-10 and INT-12 add
  the row route, INT-9 and INT-12 the `Escape` route. The rule still bites in its guard form —
  nothing is deleted, and the images `✕` check stays untouched and passing.
- **The row highlight is verified, not restyled.** Decided at the gate: the request asked for a
  removal, not a restyling, and strengthening the emphasis would be a visual change on a settled
  screen. The residual is recorded as a risk below.
- **No surface, no blur, no allow-list edit.** The change removes a control and adds a key binding.
  `client/scripts/check-ui-conformance.mjs` is not edited, `blurAllowedOverlaySelectors` gains
  nothing, the `CLAUDE.md` allow-list table gains no row, and no new CSS declares a filter. If a
  selector seems to be needed, something has been invented that this change does not need.
- **Rows stay non-operable by keyboard.** No `tabIndex`, `role`, `onKeyDown` or `aria-expanded` is
  added to a `DataTable` row. INT-4's `tabIndex={-1}` region is a focus **destination**, not a
  control, and adds no tab stop. Making rows real disclosure controls touches a shared table and two
  screens and is its own future request.
- **The test runs belong to this session and are batch-scoped**, as they were for change-1: the
  human has delegated them and the machine is held, so the concurrent-run hazard does not apply. The
  tester runs `npm run lint`, `npm run test:typecheck -w client`, this batch's unit files and this
  batch's e2e specs (`containers.spec.ts`, `container-exec-attach.spec.ts`) — **not** the full unit
  suite and **not** the complete e2e suite, which run once at the end, after all six items of
  `bugs.md` are certified. change-2 is the second of six. No server pass is in scope: nothing
  server-side is touched.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` (current) and `CLAUDE.md`: `client/src/ui/` is the only place allowed raw DOM tags
  and CSS; everything else under `client/src/` composes it.

## Departures from the spec

**None.** Three requirement texts were refined after the requirements gate, and all three narrow the
plan towards the spec rather than away from it:

- **REQ-9** originally read that `Escape` "resolves that dialog"; no dialog in the product closes on
  `Escape` today, and making them all do so is outside this request. It now requires only that the
  panel not be dismissed behind an open dialog, which is what the spec's innermost-first rule
  actually asks for here.
- **REQ-19** originally spoke only of rewriting existing checks; the repository has none for this
  panel, so the requirement now also states the positive half — the dismissal routes must be covered
  after this change — which is the coverage the spec's own wording exists to protect.
- **REQ-16** originally required the panel to close when its row is filtered out. The spec asks that
  the panel "resolve itself rather than remain open with no route out"; checked against the
  mechanism, a filtered-out row renders no panel at all, so there is nothing open and nothing to
  resolve. REQ-16 now requires the existing behaviour to survive instead — which honours the spec's
  actual concern and removes what would otherwise have been a behaviour change the request never
  asked for. See the assumption above for the full reasoning; it reverses a gate answer and must not
  be reinstated from it.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside this batch — there is only
one batch, so nothing is split across batches.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-3, INT-6, INT-9, INT-12 |
| REQ-2 | 1 | INT-3, INT-6, INT-9 |
| REQ-3 | 1 | INT-7, INT-10, INT-12 |
| REQ-4 | 1 | INT-7, INT-10, INT-12 |
| REQ-5 | 1 | INT-1, INT-3, INT-6, INT-8, INT-9, INT-12 |
| REQ-6 | 1 | INT-3, INT-8 |
| REQ-7 | 1 | INT-1, INT-2, INT-8, INT-12 |
| REQ-8 | 1 | INT-1, INT-5, INT-8, INT-13 |
| REQ-9 | 1 | INT-1, INT-12 |
| REQ-10 | 1 | INT-1, INT-3, INT-8 |
| REQ-11 | 1 | INT-3, INT-4, INT-8 |
| REQ-12 | 1 | INT-7, INT-12 |
| REQ-13 | 1 | INT-3, INT-8 |
| REQ-14 | 1 | INT-3, INT-6, INT-11 |
| REQ-15 | 1 | INT-7, INT-10 |
| REQ-16 | 1 | INT-7, INT-10, INT-12 |
| REQ-17 | 1 | INT-6 |
| REQ-18 | 1 | INT-3 |
| REQ-19 | 1 | INT-9, INT-10, INT-11, INT-12, INT-13 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none. INT-1
would have been the candidate — it is infrastructure — but it carries REQ-7, REQ-8, REQ-9 and REQ-10
in its own right, since those requirements are about which surface a keystroke belongs to rather
than about containers.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-5, REQ-7, REQ-8, REQ-9, REQ-10 |
| INT-2 | REQ-7 |
| INT-3 | REQ-1, REQ-2, REQ-5, REQ-6, REQ-11, REQ-13, REQ-14, REQ-18 |
| INT-4 | REQ-11 |
| INT-5 | REQ-8 |
| INT-6 | REQ-1, REQ-2, REQ-5, REQ-14, REQ-17 |
| INT-7 | REQ-3, REQ-4, REQ-12, REQ-15, REQ-16 |
| INT-8 | REQ-5, REQ-6, REQ-7, REQ-8, REQ-10, REQ-11, REQ-13 |
| INT-9 | REQ-1, REQ-2, REQ-5, REQ-19 |
| INT-10 | REQ-3, REQ-4, REQ-15, REQ-16, REQ-19 |
| INT-11 | REQ-14, REQ-19 |
| INT-12 | REQ-1, REQ-3, REQ-4, REQ-5, REQ-7, REQ-9, REQ-12, REQ-16, REQ-19 |
| INT-13 | REQ-8, REQ-19 |

**Four notes on the shape of that mapping**, all deliberate:

- **REQ-3, REQ-4, REQ-12, REQ-15 and REQ-16 are preservation requirements**: the behaviour exists
  today and the change promotes it from a convenience to a guarantee. No intervention builds them;
  INT-7 is where they are kept true and INT-10/INT-12 are where they are finally asserted — which,
  for all five, is the first time anything asserts them at all. INT-7 consequently adds no behaviour:
  it is the instruction not to lose any, which is precisely what removing the second dismissal route
  puts at risk.
- **REQ-18 is closed by an untouched file.** `client/scripts/check-ui-conformance.mjs` already fails
  any runtime blur outside the allow-list and any raw DOM tag outside the library, so "this change
  adds no surface" is enforced precisely by INT-3 leaving that script, the allow-list and the
  `CLAUDE.md` table alone while it removes a control and adds no CSS filter.
- **REQ-17 hangs on a single intervention on purpose.** "Nothing else about this panel changes" is
  kept true where the panel is edited (INT-6) and is contradicted by any observable difference the
  tester finds. It is not a requirement anything can add; it is one the batch can only fail.
- **INT-2 and INT-5 each serve one requirement, and both are load-bearing.** They are the two places
  an existing consumer of `Escape` is made to win over the new one: the menu that already binds the
  document, and the terminal that must never lose the key. Neither is a refactor for tidiness.

## Risks carried forward

- **Discoverability, with a documented precedent.** After this change nothing on screen states the
  panel can be closed; the operator must infer that the row un-clicks. GitLab shipped the same
  inference and its users reported being unable to find the way out (the spec cites the issue). The
  row's selected treatment now carries that burden alone and is deliberately **not** strengthened
  here. If it proves insufficient in use, the reversal is cheap — the container panel asks for the
  presentation *with* the close control — and strengthening the row's open state is a follow-up with
  its own justification.
- **The images inconsistency becomes permanent if change-3 slips.** One visible instance, accepted as
  temporary. `INT-11` is what keeps the images panel's control alive in the meantime.
- **The variant as a licence.** Once a panel can present without a close control, one sentence stands
  between this change and panels with no way out. INT-3 records that rule on the component so each
  future use is a decision, not a default.
