---
batch: 1 · image-row-actions
feature: F1 — The images row's actions move into one menu, and the image panel closes by its row
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37]
depends: []
---

# Batch 1 — The images row's actions move into one menu, and the image panel closes by its row

The images row's six flat actions move behind the overflow menu change-1 built, leaving the row's
action area holding that one control and giving the width back to the data; and the image detail
panel drops its `✕` through the presentation variant change-2 built, leaving the row and `Escape` as
the ways out. **Almost nothing is built here: two certified library affordances are consumed, one
design token is added, and one genuinely new behaviour arrives — the selection is cleared when its
image leaves the list.**

The batch has two halves and they must stay separable. **Half one is INT-2** (with INT-1 behind it);
**half two is INT-3 and INT-4**. A failure names its half by naming the intervention.

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not
restate it here.

## What is already true, and must stay true

Read before starting; these are the facts the interventions are written against, checked in the
indexes, the component specs and — where a spec could not settle it — the code itself.

- **The row today** (`client/src/images/ImagesScreen.tsx`, `actionsFor`, ~line 365): six `RowAction`s
  — `run`, `tag`, `untag`, `push`, `save`, `remove` — rendered by `<ActionButtonGroup actions={…} />`
  in an `ACTIONS` column of width `var(--data-table-action-column-width)`. `untag` and `push` are
  `disabled` when `image.tags.length === 0`, **with no `disabledReason`** (REQ-9 is new work, not
  preservation). `remove` is `destructive`. The labels are the lower-case CLI verbs.
- **What each action actually does**, because REQ-7 and REQ-10 depend on it and one of these
  contradicts the spec's own summary: `run` → `setRunReference(image.tags[0] ?? image.shortId)`,
  opening `ContainerCreateForm` (a `FormSheet`) pre-filled; `tag` → a `FormDialog` for the new
  reference; `untag` → **immediate** when the image has exactly one tag, a `FormDialog` with a
  `Select` when it has several; `push` → **always** a `FormDialog` collecting the reference (a
  `Select` above one tag, a `TextField` otherwise) then the per-layer progress stream; `save` →
  **no dialog at all**, `triggerDownload` plus a "Download started" toast; `remove` →
  `useConfirmation().confirm()` and only then the removal. Hence the labels in REQ-7, and hence the
  departure recorded in [`../batches.md`](../batches.md).
- **The overflow affordance exists and is certified** (`.sdd/modules/ui-library/specs/menu.md`,
  `specs/action-button-group.md`): `ActionButtonGroup`'s `overflow?: { label, entries }` renders a
  `Menu` as the group's **last** slot; `MenuEntry` already carries `label`, `hint`, `destructive`,
  `separated`, `disabled`, `disabledReason` and `onSelect`. The component maps `actions` and then
  renders the overflow, so **an empty `actions` array renders the trigger alone** — no library change
  is needed to hold a menu-only row. One menu open at a time, never clipped, keyboard-operable,
  focus returned to the trigger, gone with its trigger when the row unmounts: all of it is the
  library's, already asserted by `menu.md`'s own tests.
- **The containers row is the shape to copy** (`ContainersScreen.tsx`, `overflowEntriesFor` ~line
  289): entries built per row with handlers bound to that row's object, `separated` + `destructive`
  on the two dangerous entries, `disabledReason` on every disabled one, and the trigger named
  `More actions for ${container.name}`.
- **The panel today** (`client/src/images/ImageDetailPanel.tsx`, ~line 74): `<DetailPanel onClose
  actions={4 buttons}>`, taking `dismissal`'s default — the presentation *with* the close control
  (`Close detail`). The four actions are `Explore layers…`, `Efficiency & signals…`,
  `Browse filesystem…` and `Compare with…`, the last disabled below two images. **This panel keeps a
  populated action bar**: unlike the container panel, only the close control leaves.
- **`dismissal="opening-gesture"` is built, certified and does everything half two needs**
  (`.sdd/modules/ui-library/specs/detail-panel.md`): no close control and no space reserved for it,
  `Escape` calling `onClose` from anywhere inside the body, the claim registered through the
  arbitration, and the focus handed to the nearest enclosing dismissal focus target — which the
  `DataTable`'s list region already is — before the panel unmounts.
- **`Escape` already has every claimant this screen needs but one**
  (`.sdd/modules/ui-library/specs/escape-arbitration.md`): `Modal` and everything built on it,
  `FormSheet`, and `DetailPanel` in its control-less presentation all claim through one registry,
  innermost-first. On this screen that covers `LayerExplorer`, `LayerEfficiencyView`,
  `FilesystemBrowser`, `ImageDiffView` (all `Modal`s), the six `FormDialog`s, the remove confirmation
  and `ContainerCreateForm` (a `FormSheet`). The **only** new claimant is the row menu, and it claims
  by being `Menu`. **A second document-level `Escape` listener anywhere in this batch is a defect**,
  not an implementation choice.
- **The panel cannot outlive its row on screen, but the selection can outlive its image.**
  `ImagesScreen` renders the panel as the table's `renderExpanded` keyed to `expandedRowKey={selectedId}`
  over `rows={filtered}`: an image that leaves the list renders no row and no panel. But there is
  **no effect clearing `selectedId`** — `ContainersScreen.tsx:154-156` has had one since it was
  written and this screen never got one. Image ids are content digests, so removing an image and
  later pulling or building the same content reproduces the same id and the panel springs open
  unasked. That is INT-4, and it is the batch's only new behaviour.
- **The action column token is shared with the containers screen.**
  `client/src/ui/tokens.css:132` — `--data-table-action-column-width: 296px`, commented as sized for
  "up to 6 dense action buttons on one line". Those six are *this* row's. `ContainersScreen.tsx:372`
  uses the same token for three buttons plus the overflow. Narrowing it in place would break the
  containers row; leaving images on it leaves REQ-18 unpaid.
- **Multi-selection is not a row action and is not in this change.** The leading checkbox column,
  `BulkActionBar` and its `Save to tarball…` / `Compare filesystems…` actions stay exactly as they
  are (REQ-19). Nothing moves into the row's menu from there and nothing moves out of it.
- **The existing coverage that this change invalidates**, all of it to be rewritten and none of it
  deleted (REQ-32): unit — `images-screen.test.tsx` (row buttons at lines 233-236, 243, 258, 274,
  288, 302, 543; the expanded-region test at 329-340; the `Close detail` test at 344-355, which
  change-2 added as the guard on its own default) and `container-create-entry-points.test.tsx`
  (the images row's `run`, four clicks); e2e — `images.spec.ts` (187, 222, 247, 273-274, 293, 302,
  334, 430), `image-transport.spec.ts:72` (`save`), `container-create-run.spec.ts:265` (`run`) and
  `filesystem-browser.spec.ts:160`, the one `Close detail` click left in the repository.
  `client/e2e/exclusive/prune.spec.ts` drives the toolbar, never a row action: untouched.
- **The blur policy** (`CLAUDE.md`, `.sdd/modules/ui-library/specs/overlay-glass.md`): closed
  allow-list, one blur value. The menu popup was admitted with change-1; this batch adds a consumer,
  not a surface. `client/scripts/check-ui-conformance.mjs` is **not edited**,
  `blurAllowedOverlaySelectors` gains nothing, and the `CLAUDE.md` table gains no row (REQ-35).
- **Rows are not keyboard-operable, and this batch does not change that.** No `tabIndex`, `role`,
  `onKeyDown` or `aria-expanded` is added to a `DataTable` row. Making rows real disclosure controls
  is the separate request change-2 recommended. Do not start it here.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/tokens.css` | The width of a row action column that holds **only** the overflow control, as a design token of its own — sized for that single trigger plus the cell's own breathing room, and nothing more, so the width the six buttons held goes back to the data columns beside it (REQ-18). It is generic: any list screen whose action column comes down to the menu uses it, and the value exists in exactly one place because feature code may write no length. **Do not narrow `--data-table-action-column-width`**: the containers screen sizes its three buttons plus overflow from it. Correct that token's comment, which today says it is sized for six dense buttons — after this batch no column in the product holds six. Nothing else in the file changes, and no blur, filter or overlay value is added anywhere near it (REQ-35). Update `.sdd/modules/ui-library/specs/design-tokens.md`. | REQ-18, REQ-34 | — |
| INT-2 | modify | `client/src/images/ImagesScreen.tsx` — the row's action column (`actionsFor`, the `actions` column definition) | **Half one, whole and entire.** The row's action area comes down to one control: `ActionButtonGroup` with **no action buttons** and only its trailing `overflow` slot, so the row carries the `…` and nothing else, on every row and in every state of the image (REQ-1, REQ-2). Name the trigger `More actions for ${displayTitle(image)}` — the existing helper, which reads `<none> (shortId)` for a dangling image and so keeps two dangling rows apart — matching change-1's shape (REQ-3). Six entries, in the row's own left-to-right order and never a different one between openings: `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, then `Remove` last, `separated` from the five above it and `destructive`, carrying `rmi` as its `hint` — and no other entry carrying a hint, the rest of the labels being the CLI verbs already (REQ-4, REQ-5, REQ-6, REQ-7). `Untag` and `Push…` stay in place and in order when the image has no tags, `disabled` with a `disabledReason` stating the condition of *this* image ("no tags to untag" / "…to push"), never removed (REQ-8, REQ-9). **The handlers are today's handlers, unchanged and bound to the row's own image** — `setRunReference`, `openTagDialog`, `startUntag`, `openPushDialog`, `startSave`, `handleRemove` with its existing confirmation — so every operation behaves exactly as it did and none can be redirected at an image that took another's place while the list re-read (REQ-10, REQ-11, REQ-16). Point the column at INT-1's token (REQ-18). Composition only: no raw DOM tag, no CSS, no `style`/`className`, no new tone or text role (REQ-17, REQ-35, REQ-36); the shared `Menu` supplies one-menu-at-a-time, non-clipping, keyboard operation and focus return by being used unchanged (REQ-12, REQ-13, REQ-14, REQ-15), and the menu is the innermost `Escape` claimant on this screen by the same fact (REQ-25). **Leave the multi-select checkbox column, `BulkActionBar` and its two bulk actions exactly as they are** (REQ-19), leave the `ACTIONS` header, leave `useImages`' polling and event re-reads untouched (REQ-33), and change nothing else on this screen (REQ-37). **If this intervention starts editing `Menu.tsx` or `ActionButtonGroup.tsx`, stop**: that is the second-affordance failure change-1 named, and anything genuinely missing must be added generically instead. Update `.sdd/modules/images/specs/images-screen.md`. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-25, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37 | INT-1 |
| INT-3 | modify | `client/src/images/ImageDetailPanel.tsx` | **Half two, the removal.** Ask the shared panel for the presentation **without** the close control — change-2's existing `dismissal` variant, selected through the component's public contract, with no new variant and no images-specific panel (REQ-20, REQ-31). `onClose` keeps its contract and its caller; it is now reached by `Escape` and by the row, and by no control on the panel (REQ-24). The library's claim through the arbitration is what makes `Escape` innermost-first here — the row menu, any dialog and any of this panel's own flows take the key first, and with no panel open the key is left alone (REQ-25, REQ-26) — and what hands the point of interaction to the table's list region before the panel unmounts (REQ-27). **The four actions are untouched**: `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…`, same order, same behaviour, `Compare with…` still disabled below two images — this panel loses one control and keeps a populated action bar, which is where it deliberately differs from the container panel (REQ-21). Say so on the spot, in a comment, so the difference reads as the decision it is. No CSS, no overlay surface, no filter (REQ-35); nothing else about the panel's contents, sections or raw payload changes (REQ-37). Update `.sdd/modules/images/specs/image-detail-panel.md`. | REQ-20, REQ-21, REQ-24, REQ-25, REQ-26, REQ-27, REQ-31, REQ-35, REQ-37 | — |
| INT-4 | modify | `client/src/images/ImagesScreen.tsx` — the selection state (`selectedId`) | **Half two, the behaviour**, deliberately separate from INT-3 so that a regression here points at itself and not at the missing `✕`. The selection does not outlive its image: when `selectedId` names an image that is no longer in the list, clear it — mirroring `ContainersScreen.tsx:154-156`, which this screen never got. **Compare against the unfiltered `images`, never against `filtered`**: an image hidden by the search has not left the list, keeps its selection and brings its panel back unchanged when the search is cleared (REQ-30), while an image removed from its own row's menu, pruned, or removed from the operator's terminal takes row, panel and selection with it (REQ-29). The hazard is not a stranded panel — there cannot be one, the panel being the table's `renderExpanded` beneath its own row — it is that image ids are content digests, so the same content pulled or built again reproduces the id and a surviving selection opens the panel unasked. **Preserve the rest of the selection semantics exactly**, which this change promotes from convenience to guarantee now that the `✕` is gone: re-selecting the selected row closes the panel, selecting another row keeps the panel open and re-points it, and the owning row stays visibly the selected one through the table's existing selected treatment and `aria-selected` (REQ-22, REQ-23, REQ-28). **Do not restyle the row's selected state** and do not touch the multi-selection state (`selectedIds`), which is a different thing entirely. Record the behaviour in `.sdd/modules/images/specs/images-screen.md`. | REQ-22, REQ-23, REQ-28, REQ-29, REQ-30, REQ-37 | — |
| INT-5 | modify | `client/test/unit/images-screen.test.tsx` | The screen's own unit coverage, rewritten and extended — **delete nothing that is there**. Half one: the row's action area carries exactly one control and none of the six buttons survives anywhere on it (REQ-1, REQ-2); the menu holds six entries in order with the labels and ellipses of REQ-7 and no others (REQ-4); `Remove` is destructive, set apart and carries `rmi` (REQ-5, REQ-6); on a tagless image `Untag` and `Push…` are present, disabled and state why (REQ-8, REQ-9); the existing assertions that clicked `untag`, `remove`, `tag` and `save` now reach those operations through their entries and still assert the same outcome, the remove confirmation included (REQ-10, REQ-11); the action column is sized from INT-1's token, not the six-button one (REQ-18); the checkbox column and bulk bar tests keep passing untouched (REQ-19). Half two: the panel offers **no** `Close detail` control (invert the check change-2 added at line 344, do not remove it) and closes by re-selecting its row, by selecting nothing, and by `Escape` — and `Escape` with no panel open changes nothing (REQ-20, REQ-22, REQ-23, REQ-24, REQ-26, REQ-31); the four panel actions are still there, in order, `Compare with…` still disabled below two images (REQ-21); the dismissal leaves the point of interaction on the list region rather than on the removed subtree (REQ-27); an image that leaves the list takes its panel **and its selection** with it — re-adding an image with the same id does not reopen the panel — while an image excluded by the search keeps both and gets them back when the search clears (REQ-29, REQ-30). The expanded-region test at 329-340 asserts the absence of the old button labels and is vacuous after this change: rewrite it to assert what it meant — the expanded region carries the panel alone, with no row control inside it (REQ-1, REQ-17). | REQ-1, REQ-2, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-26, REQ-27, REQ-29, REQ-30, REQ-31, REQ-32 | INT-2, INT-3, INT-4 |
| INT-6 | modify | `client/test/unit/container-create-entry-points.test.tsx` | The four clicks on the images row's `run` button reach the create-and-run form through the `Run…` entry instead. What each of those tests proves is unchanged — the form opens pre-filled with the image's reference, its short id when the image is dangling — and none of them is dropped because the button is gone (REQ-10, REQ-32). Change nothing else in this file: its containers-side entry points are not this batch's business. | REQ-10, REQ-32 | INT-2 |
| INT-7 | modify | `client/e2e/images.spec.ts` | Against the real daemon, in the browser — the routes only a live list can show. **Delete nothing that is there**; every existing check reaches its operation through the menu and keeps asserting the same daemon outcome (REQ-10, REQ-32). Half one: the row's action area carries the `…` and nothing else, on a tagged row and on a dangling one, and it is in the same final position on both (REQ-1, REQ-2); the trigger names its image and announces that it opens a menu and whether it is open (REQ-3); the open menu shows the six entries in order with their labels (REQ-4, REQ-7); on a dangling image `Untag` and `Push…` are disabled and their reason is readable (REQ-8, REQ-9); `Tag…`, `Untag`, `Push…` and `Remove` do what they did, `Remove` still asking its confirmation and doing nothing when it is refused (REQ-10, REQ-11); opening a second row's menu closes the first (REQ-12); `Escape`, a click away and choosing an entry each close the menu and hand the focus back to the trigger (REQ-13); the menu of a row at the bottom of a long list opens in full and is not clipped by the table (REQ-14); the trigger and its entries are reachable and activatable from the keyboard alone (REQ-15); with a menu open, an image tagged or removed from the CLI still updates the list, and the entry chosen afterwards acts on its own image or the menu is gone (REQ-16, REQ-33); the checkbox column and the bulk bar still work (REQ-19). Half two: the open panel carries no `Close detail` (REQ-20) and its four actions are unchanged (REQ-21); re-selecting the row closes it (REQ-22), another row re-points it (REQ-23), `Escape` closes it (REQ-24); with that row's menu open `Escape` closes **only** the menu and a second one closes the panel, and with the tag dialog or the remove confirmation open `Escape` leaves the panel exactly as it was (REQ-25); the owning row is visibly the selected one (REQ-28); removing the image whose panel is open takes row and panel away together and **does not bring the panel back** when the same reference is tagged again (REQ-29); a search that excludes the row takes row and panel off screen together and clearing it brings both back (REQ-30). Test rules apply without exception: own fixtures with the ownership labels, `docker rm -fv` in a `finally`, assertions on its own fixtures rather than on totals or emptiness, no reach to Docker Hub, and the file passes when run on its own. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-28, REQ-29, REQ-30, REQ-32, REQ-33 | INT-2, INT-3, INT-4 |
| INT-8 | modify | `client/e2e/image-transport.spec.ts` | The `save` click at line 72 becomes the `Save` entry, and the check keeps proving what it proved: the tarball download starts and is named after the reference (REQ-10, REQ-32). The download stays the runner's — hand it back with `download.delete()` as the file already does — and the file's fixtures and cleanup are untouched. Its containers-side `More actions for …` usage at line 185 is already the menu and stays as it is. | REQ-10, REQ-32 | INT-2 |
| INT-9 | modify | `client/e2e/container-create-run.spec.ts` | The `run` click at line 265 becomes the `Run…` entry; the test still proves that the create-and-run form opens from the images screen pre-filled with that image and that the container it creates runs (REQ-10, REQ-32). Everything else in the file, fixtures and cleanup included, stays as it is. | REQ-10, REQ-32 | INT-2 |
| INT-10 | modify | `client/e2e/filesystem-browser.spec.ts` | The one `Close detail` click left in the repository (line 160) closes the **images** panel, and after this batch that control does not exist. Rewrite it to a surviving route — re-selecting the owning row, or `Escape` — so the spec still gets from the browser back to the list (REQ-20, REQ-22, REQ-32). This is the check change-2 deliberately left passing untouched until change-3 reached this screen; it is rewritten now, not deleted. Nothing else in the file changes: its extraction, cache and cleanup behaviour is not this batch's business. | REQ-20, REQ-22, REQ-32 | INT-3, INT-4 |

## Order

`INT-1` → `INT-2`, `INT-3`, `INT-4` → `INT-5`, `INT-6`, `INT-7`, `INT-8`, `INT-9`, `INT-10`.

The token first, since INT-2 consumes it. INT-2, INT-3 and INT-4 are independent of one another —
that is the point of the split — but **INT-3 and INT-4 land together**: between them the panel has no
close control while a stale selection can still reopen it, which is a defect shipped in the middle of
a batch. INT-10 can be written the moment INT-3 exists, since its whole job is to stop using a
control that has gone.

## Out of this batch

From the spec's own Scope, and not to be drifted into: **the image detail panel's four action
buttons**, which are panel actions rather than row actions, one of them inherently a two-object
operation, and which stay exactly where they are; any change to what an action does, to its form, to
its confirmation, to its feedback or to the API behind it; any new image capability, including
anything read off the screenshot; **multi-select, bulk actions or selection-plus-toolbar designs** —
the existing checkbox column and bulk bar are preserved, not extended and not absorbed into the
menu; the same reorganisation on **any other screen** — volumes, networks, Compose, Swarm,
registries, contexts, builders, plugins — which keep their arrangement until asked for separately;
the images screen's columns, sorting, search, expansion behaviour and top-level toolbar; keyboard
shortcuts other than `Escape` for dismissal; **making rows keyboard-operable disclosure controls**,
which remains the separate request change-2 recommended; strengthening the row's selected treatment;
any redesign of the liquid-glass material or any addition to the blur allow-list; `Escape`-to-close
on `Modal`, `FormDialog`, `FormSheet` or any confirmation, none of which closes on the key today; and
the three remaining items of `bugs.md` (bug-1, bug-2, bug-3). No server code, no endpoint, no Docker
call is touched, and no library component other than `tokens.css` is edited.

## Human acceptance

**Half one — the row.** On the Images & layers screen, the end of every image row carries a single
`…` control and nothing else — no `run`, no `tag`, no `untag`, no `push`, no `save`, no `remove`
anywhere on the row — in the same final position on every row, tagged or dangling, without hovering.
The table's own columns are visibly wider than before: the strip of six buttons is gone and the
repository, id, platform, size and creation columns have taken the space back. Opening the control
gives exactly six entries, in this order: `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove` — with
`Remove` last, in the destructive tone, set apart from the five above it, and carrying `rmi` beside
its label; no other entry carries a hint. On a `<none>` image the same six entries appear in the same
order, with `Untag` and `Push…` greyed and saying why they are unavailable rather than disappearing.
Each entry does exactly what its button did: `Run…` opens the create-and-run form pre-filled with the
image, `Tag…` asks for the new reference and tags, `Untag` untags at once when the image has one tag
and asks which when it has several, `Push…` asks which reference and shows per-layer upload progress,
`Save` starts the tarball download and reports it, `Remove` asks the same confirmation as before and
removes only when it is accepted. Opening a second row's menu closes the first; choosing an entry,
pressing `Escape` and clicking away all close it and put the focus back on the `…`; a row at the
bottom of a long list opens its menu in full, not clipped by the table; the whole thing works from the
keyboard alone. Pulling or removing an image from another terminal while a menu is open leaves the
list updating as before, and the menu either stays with its own image or closes — it never acts on
the row that took its place. The leading checkboxes and the bulk bar (`Save to tarball…`,
`Compare filesystems…`) behave exactly as they did.

**Half two — the panel.** Selecting an image opens its detail panel below the row and **there is no
`✕` anywhere on it**, with no gap or stray padding where it sat. The four actions —
`Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — are unchanged, in
the same order, with `Compare with…` still unavailable when there are fewer than two images. Clicking
that same row again closes the panel; clicking a different row leaves it open on the other image.
`Escape` closes it, including from focus inside its body. With that row's `…` menu open, `Escape`
closes only the menu and the panel is still there; pressing it again closes the panel. With the tag
dialog, the remove confirmation, the layer explorer, the efficiency view, the filesystem browser or
the comparison open, `Escape` leaves the panel exactly as it was. With no panel open, `Escape`
changes nothing. `Remove`, chosen from the menu of the very row whose panel is open, takes the row,
the panel and the selection away together — and pulling or building that same image again afterwards
does **not** make its panel reappear on its own. Typing a search term that hides the row takes row
and panel off screen together, and clearing it brings both back exactly as they were. While a panel
is open, its row is visibly the selected one.

**Nothing else.** On the Containers screen everything is as change-1 and change-2 left it. On this
screen the toolbar, the columns, the search, the empty state, the pull/load/import flows, the prune,
the panel's contents and every daemon call behind them are unchanged.

**The batch's test runs are batch-scoped**, and the tester runs exactly these: `npm run lint`,
`npm run test:typecheck -w client`, `npm run test -w client` for this batch's unit files
(`images-screen.test.tsx`, `container-create-entry-points.test.tsx`, with the UI conformance check
included and `client/scripts/check-ui-conformance.mjs` unmodified), and this batch's e2e specs
(`client/e2e/images.spec.ts`, `client/e2e/image-transport.spec.ts`,
`client/e2e/container-create-run.spec.ts`, `client/e2e/filesystem-browser.spec.ts`). **The full unit
suite and the complete e2e suite are not this batch's business**: they run once at the very end,
after every item of `bugs.md` has been certified — change-3 is the third of six and is not that end.
No server pass is in scope: nothing server-side is touched.
