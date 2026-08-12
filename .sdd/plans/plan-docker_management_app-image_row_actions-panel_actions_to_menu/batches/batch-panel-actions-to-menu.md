---
batch: 1 · panel-actions-to-menu
feature: F1 — The image panel's four actions become row-menu entries, and their four views become the screen's
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35]
depends: []
---

# Batch 1 — The image panel's four actions become row-menu entries, and their four views become the screen's

The image detail panel's four buttons leave, its action bar is omitted entirely, and the four flows
they opened — `LayerExplorer`, `LayerEfficiencyView`, `FilesystemBrowser`, `ImageDiffView` — become
views the **screen** presents, opened from four new entries at the top of the row's overflow menu.
**Almost nothing is invented: the flows already exist, the menu already exists and is not touched, and
one of the four is already hosted at screen level. What is genuinely new is that a flow can now be
orphaned by its image, and that one comparison view must serve two shapes of the operation.**

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not restate
it here.

## What is already true, and must stay true

Read before starting. These are the facts the interventions are written against, checked in the
module indexes, the component specs, and — where a spec could not settle it — the code itself.

- **The panel today** (`client/src/images/ImageDetailPanel.tsx`): a `DetailPanel` with
  `dismissal="opening-gesture"` (no `✕`, `Escape` closes it) and an `actions` node holding four
  `Button variant="secondary"` — `Explore layers…` → `setLayersOpen(true)`, `Efficiency & signals…` →
  `setSignalsOpen(true)`, `Browse filesystem…` → `setFilesystemOpen(true)`, `Compare with…` →
  `setDiffOpen(true)` with `disabled={images.length < 2}`. Below its body it renders all four flow
  components.
- **The three things the panel gives those flows beyond the image**, and the reason INT-2 exists:
  - `navigateToLayer(layerIndex)` → `setSignalsOpen(false)`, `setInitialSelectedLayerIndex(i)`,
    `setAutoAnalyzeLayers(true)`, `setLayersOpen(true)`. It is passed as `onNavigateToLayer` and is
    how a finding reaches its layer **already primed**, past the cost warning.
  - `onFindingsChange={setLayersWithFindings}` → the `Map<layerIndex, count>` handed to
    `LayerExplorer`'s `layersWithFindings`, which is what draws its `SIGNALS` markers. It fires only
    once a result exists (`.sdd/modules/images/specs/layer-efficiency-view.md`).
  - `layerFocus?: { layerIndex?, requestId }` → an effect setting `initialSelectedLayerIndex`,
    `autoAnalyze=false` and opening the explorer. The screen produces it in the `useCrossNavigation`
    effect (`ImagesScreen.tsx` ~line 190), which also does `setSelectedId(request.objectId)`. This is
    `plan-docker_management_app/REQ-69`, a certified requirement of another plan.
- **The flows' contracts, unchanged by this batch.** `<LayerExplorer image open onClose
  initialSelectedLayerIndex? autoAnalyze? layersWithFindings? />`; `<LayerEfficiencyView image open
  onClose onNavigateToLayer onFindingsChange? />`; `<FilesystemBrowser image open onClose />`;
  `<ImageDiffView images initialImageAId? initialImageBId? open onClose />`. All four are `Modal`s,
  and `Modal` renders nothing when `open` is false.
- **`ImageDiffView` exists twice today**, and after this batch exactly once. The panel renders one
  with `initialImageAId={image.id}` and no B; `ImagesScreen` renders another at screen level for the
  bulk path (`startCompareSelected` sets `diffImageAId` **and** `diffImageBId` from
  `selectedIds[0]`/`[1]`). Its `useEffect` on `[open, initialImageAId, initialImageBId]` re-seeds both
  operands on each opening, which is what makes one instance able to serve both shapes.
- **Self-comparison is already prevented**: `ImageDiffView`'s Compare button is
  `disabled={!imageA || !imageB || imageAId === imageBId}` (REQ-27 is preservation).
- **The row's menu today** (`ImagesScreen.tsx`, `overflowEntriesFor` ~line 399): six `MenuEntry`s —
  `Run…`, `Tag…`, `Untag` (disabled + `NO_TAGS_TO_UNTAG_REASON` when tagless), `Push…` (likewise),
  `Save`, `Remove` (`hint: 'rmi'`, `destructive: true`, `separated: true`). Rendered by
  `<ActionButtonGroup actions={[]} overflow={{ label: \`More actions for ${displayTitle(image)}\`,
  entries }} />` in an `ACTIONS` column sized `var(--data-table-menu-action-column-width)`.
  **`separated: true` marks a separator above its entry** — that is how `Remove` is set apart, and it
  is the whole mechanism the second group boundary needs.
- **The menu component and the row-action group are not modified** (spec instruction).
  `MenuEntry` already carries `label`, `hint`, `destructive`, `separated`, `disabled`,
  `disabledReason` and `onSelect`; one menu open at a time, never clipped, keyboard-operable, focus
  returned to the trigger, gone with its trigger when the row unmounts — all of it is the library's,
  already asserted by `.sdd/modules/ui-library/specs/menu.md`'s own tests. **If this batch starts
  editing `client/src/ui/controls/Menu.tsx` or `ActionButtonGroup.tsx`, stop and come back.**
- **`DetailPanel.actions` is optional** (`.sdd/modules/ui-library/specs/detail-panel.md`). REQ-2 is
  met by omitting the prop; an empty fragment keeps the header's slot spacing and produces the gap
  REQ-2 forbids. The `dismissal="opening-gesture"` presentation and everything change-3 built stay
  exactly as they are.
- **`Escape` closes no dialog in this product, and that is deliberate**
  (`.sdd/modules/ui-library/specs/modal.md`, `escape-arbitration.md`): an open `Modal` holds the
  innermost claim through the one registry and **consumes the key doing nothing with it**, so nothing
  underneath is dismissed out from under it. That is what REQ-18 asks for and all it asks for. There
  is exactly one document-level `Escape` listener in the whole interface; **a second one anywhere in
  this batch is a defect**, not an implementation choice.
- **The panel cannot outlive its image, and today neither can the four flows — for free.**
  `ImagesScreen` renders the panel as the `DataTable`'s `renderExpanded` keyed to
  `expandedRowKey={selectedId}` over `rows={filtered}`, and an effect
  (`ImagesScreen.tsx` ~line 210) clears `selectedId` when the image is gone from the **unfiltered**
  list. An image that leaves the list renders no row, so no panel, so the four unmount with it.
  **Hosted by the screen they no longer do.** That is INT-3, and it is the batch's most skippable
  requirement because nothing appears broken without it.
- **The blur policy** (`CLAUDE.md`, `.sdd/modules/ui-library/specs/overlay-glass.md`): closed
  allow-list, one blur value. All four surfaces are `Modal`s and already carry the overlay material;
  being opened from a menu instead of a panel changes their entry point, not their nature.
  `client/scripts/check-ui-conformance.mjs` is **not edited**, `blurAllowedOverlaySelectors` gains
  nothing, and the `CLAUDE.md` table gains no row (REQ-22).
- **The existing coverage this change invalidates**, all of it to be rewritten and none of it deleted
  (REQ-28). The human named three files; there are **seven**:
  - `client/test/unit/images-screen.test.tsx` — the panel's four actions and `Compare with…` disabled
    below two images, plus change-3's own menu and dismissal coverage.
  - `client/e2e/images.spec.ts` — the six entries, the panel's dismissal, the disabled reasons.
  - `client/e2e/layer-explorer.spec.ts` — three tests, each `selectRow(row)` then
    `page.getByRole('button', { name: 'Explore layers…' }).click()` (lines 73–75, 100–101, 148–149).
  - `client/e2e/layer-efficiency-signals.spec.ts` — opens `Efficiency & signals…` from the panel.
  - `client/e2e/filesystem-browser.spec.ts` — opens `Browse filesystem…` from the panel; also holds
    the one panel-dismissal check change-3 rewrote.
  - `client/e2e/image-diff.spec.ts` — two of three tests open `Compare with…` from the panel (lines
    108–109, 159–160); **the third is the bulk path and must stay exactly as it is** (REQ-35).
  - `client/e2e/layer-build-cache.spec.ts` — its `openLayerExplorer` helper (lines 88–99) opens
    through the panel and is used by two of its three tests; **its third test is the REQ-69
    cross-navigation guard and must pass untouched** (REQ-17).
  - `client/e2e/exclusive/prune.spec.ts` drives the toolbar only: untouched.
- **Rows are not keyboard-operable, and this batch does not change that.** No `tabIndex`, `role`,
  `onKeyDown` or `aria-expanded` is added to a `DataTable` row. That remains the separate request
  change-2 recommended. Do not start it here.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/images/ImagesScreen.tsx` — the screen's own flow state and its rendered flows | **Part three, the lift.** The screen hosts all four flows, next to the `ImageDiffView` it already renders: `LayerExplorer`, `LayerEfficiencyView` and `FilesystemBrowser` move here from the panel, and the panel's second `ImageDiffView` is dropped so **one** instance serves both shapes (REQ-35). Hold **which flow is open and for which image as one piece of state**, not four independent booleans plus a guess at the subject: the open flow names its kind and the `ImageSummary` (or id) it was invoked on, so at most one is ever open (REQ-16) and each is bound to **the image whose menu was used**, never to `selectedId` — that is the sharpest and quietest defect available here, and `selectedId` is right there and is what the panel used (REQ-14). Opening a flow touches no selection state and no panel; closing one clears only the flow (REQ-15). Resolve the image for rendering from the live `images` list by id, so a re-sort or re-read cannot re-point a flow at another image (REQ-14). The four keep their existing contracts and their existing props verbatim — same views, same loading, same cost warnings, same cancels, same caching, and nothing that changes what the analysis cache is keyed by or when it is consulted (REQ-4, REQ-21). Composition only: no raw DOM tag, no CSS, no `style`/`className`, no new surface and no filter (REQ-22, REQ-34). `Escape` needs **nothing built**: the flows are `Modal`s and claim the key through the one arbitration registry, consuming it and dismissing nothing beneath — **a second document-level `Escape` listener is a defect** (REQ-18). The point of interaction is expected to hold for free, the `Menu` having handed the focus back to the row's `…` before the flow opened; **measure it, do not assume it**, and if it is lost to the document when a flow closes with no panel around it, stop and come back rather than inventing an images-specific fix (REQ-19, REQ-33). Update `.sdd/modules/images/specs/images-screen.md`. | REQ-4, REQ-13, REQ-14, REQ-15, REQ-16, REQ-18, REQ-19, REQ-21, REQ-22, REQ-33, REQ-34, REQ-35 | — |
| INT-2 | modify | `client/src/images/ImagesScreen.tsx` — the glue the panel used to hold | **Part three, the behaviour that would be lost in silence**, deliberately separate from INT-1 because none of it fails loudly. Three things move up with the flows and must keep working exactly: (a) `onNavigateToLayer` — a finding closes the efficiency view and opens the layer explorer at that layer with the analysis **already primed** (`autoAnalyze`), not behind its cost warning; (b) `onFindingsChange` — the findings map the efficiency view produces still reaches `LayerExplorer`'s `layersWithFindings`, which is what draws its `SIGNALS` markers, and still only after the view has been analysed at least once; (c) the build-cache cross-navigation — the `useCrossNavigation` effect keeps doing **exactly what it does today**: select the image, and open the layer explorer at the named layer on arrival and again on every later `requestId`. **The cross-navigation still selects the row and still opens its panel** — settled by the human; part three's "opening one of the four opens no panel" is about the *menu entry*, and `plan-docker_management_app/REQ-69` is a certified requirement of another plan that nobody asked to change. The `layerFocus` prop disappears from `ImageDetailPanel` because the state now lives here, not because the behaviour does. Update `.sdd/modules/images/specs/images-screen.md`. | REQ-17 | INT-1 |
| INT-3 | modify | `client/src/images/ImagesScreen.tsx` — the open flow versus the live list | **Part three, the only genuinely new behaviour**, and the requirement most likely to be skipped because nothing looks broken without it. A flow must not outlive its image: when the image an open flow is showing is no longer in the list, the flow resolves itself rather than staying open on an image that no longer exists (REQ-20). Compare against the **unfiltered** `images`, never `filtered`, and only once `loaded` — mirroring the selection effect already in this file: an image hidden by a search has not left the list, and a list not yet read says nothing about either. **This is free today and stops being free here**: the four are rendered by the panel, which is the table's `renderExpanded` beneath a row that stops existing, so they unmount with it; hosted by the screen they do not. Its own intervention so that a regression points at itself rather than at the lift. Record the behaviour in `.sdd/modules/images/specs/images-screen.md`. | REQ-20 | INT-1 |
| INT-4 | modify | `client/src/images/ImagesScreen.tsx` — `overflowEntriesFor` and its consumers | **Part two, whole and entire.** The row's menu grows from six entries to ten, in three groups, and it is **data only** — no component is touched (REQ-12). In order: `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…`, then `Run…` carrying `separated: true` to open the second group, then `Tag…`, `Untag`, `Push…`, `Save`, then `Remove` keeping its own `separated: true`, its `destructive` tone and its `rmi` hint (REQ-5, REQ-6, REQ-8). The four arrivals keep the labels and ellipses they had on the panel and carry **no** hint (REQ-7). No section heading, no label, no icon, no new tone (REQ-6, REQ-32). Their `onSelect` opens the corresponding flow through INT-1's state, bound to **this row's image** (REQ-4). `Explore layers…`, `Efficiency & signals…` and `Browse filesystem…` are never disabled — they apply to every image, as they do on the panel today. `Compare with…` is disabled when the **unfiltered** `images` holds fewer than two, exactly the condition the panel computes today, and carries a `disabledReason` phrased as a fact about **the list** ("there is no second image in the list to compare with") — deliberately unlike `Untag`/`Push…`, whose reasons are facts about *this image*; that difference is the whole point of REQ-25 and must survive review. Its availability follows the live list because the entries are rebuilt from it on every render (REQ-26). The six existing entries keep their handlers, order, labels, ellipses, tone, hint, confirmation and feedback untouched, and `Untag`/`Push…` keep their existing reasons (REQ-8, REQ-9). Everything the shared `Menu` supplies — one open at a time, never clipped, keyboard operation, real text labels, focus returned to the trigger, gone with its row — holds by consuming it unchanged (REQ-10, REQ-11, REQ-33). The `ACTIONS` column keeps `var(--data-table-menu-action-column-width)`: four more *entries* make the popup taller, not the trigger wider, and **no length may be written on this screen**. Leave `useImages`' polling and event re-reads, the checkbox column, `BulkActionBar` and the toolbar exactly as they are (REQ-31, REQ-34), and add no CSS, no surface and no filter (REQ-22). Update `.sdd/modules/images/specs/images-screen.md`. | REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-22, REQ-24, REQ-25, REQ-26, REQ-31, REQ-32, REQ-33, REQ-34 | INT-1 |
| INT-5 | modify | `client/src/images/ImageDiffView.tsx` | **Part four.** The one comparison view serves **both** shapes, and that is a constraint on it, not a note about the past (REQ-35): the bulk path arrives with both operands and opens with both pre-chosen; the row path arrives with the left one only and the right unchosen, chosen inside the view from the images the product lists (REQ-24). Neither shape may leak its operands into a later opening of the other — the existing `useEffect` re-seeding both from `initialImageAId`/`initialImageBId` on every opening is what guarantees it, and an operand left over from the previous opening is the defect to look for. **State the left-hand side when it was supplied by the invoking row** (REQ-23): the view says, in words, which image is the one the comparison was started from, by the reference the row shows, so the operator reads it rather than inferring it from a pre-filled `Select`. **Do not pin it** — the operand stays changeable, settled by the human: locking it would change the view's own behaviour, which the spec puts out of scope, and would make the row a worse door into the view than the bulk one. **Do not change the modal's title**: six e2e locators find this view by the heading `Compare filesystems`, and renaming it for cosmetics would rewrite working checks. Self-comparison stays impossible, by the Compare button's existing guard (REQ-27). Everything else — what it computes, its cost warning, its progress and cancel, its tree, its filters, its side-by-side preview — is untouched (REQ-34). Library components only, no raw DOM tag and no CSS. Update `.sdd/modules/images/specs/image-diff-view.md`. | REQ-23, REQ-24, REQ-27, REQ-34, REQ-35 | INT-1 |
| INT-6 | modify | `client/src/images/ImageDetailPanel.tsx` | **Part one.** The panel presents no actions: the four `Button`s go, and the `actions` prop is **omitted entirely** rather than passed an empty node — `DetailPanel.actions` is optional (change-2), and an empty fragment would keep the header's slot spacing and leave exactly the gap REQ-2 forbids. Nothing replaces them: no link, no chevron, no tab, no keyboard hint (REQ-1, REQ-2). The four flow components leave with them, and with them the state that only they used (`layersOpen`, `signalsOpen`, `filesystemOpen`, `diffOpen`, `autoAnalyzeLayers`, `initialSelectedLayerIndex`, `layersWithFindings`, `navigateToLayer`, the `layerFocus` effect) — all of it now the screen's (INT-1, INT-2). **Remove the two props that become dead**: `images` existed only to feed the comparison and its below-two check, and `layerFocus` only to reach the explorer; the screen is this component's only consumer, and a prop kept "in case" asserts a capability the component no longer has. Everything else is untouched: `dismissal="opening-gesture"`, `onClose`, `useImageInspect`, the definition list, the collapsible sections, the raw payload (REQ-3). Replace the on-the-spot comment that explains why this panel keeps a populated action bar with one saying the opposite and why — the emptiness is the intended end state, matching the container panel, and is not an unfinished region to fill (REQ-2). No CSS, no surface, no filter (REQ-22, REQ-34). Update `.sdd/modules/images/specs/image-detail-panel.md`, including its `Requirements served` list. | REQ-1, REQ-2, REQ-3, REQ-22, REQ-34 | INT-1, INT-2 |
| INT-7 | modify | `client/test/unit/images-screen.test.tsx` | The screen's unit coverage, rewritten and extended — **delete nothing that is there** (REQ-28, REQ-29). The menu: ten entries in the order of REQ-5, with the four arrivals' labels and ellipses and no hint on them (REQ-5, REQ-7); two group boundaries, the one above `Run…` and the one above `Remove`, and no section heading (REQ-6); the six existing entries unchanged, `Remove` still destructive with `rmi`, `Untag`/`Push…` still disabled with their own reasons on a tagless image (REQ-8, REQ-9); `Compare with…` disabled when the list holds one image, with a reason naming **the list** rather than the image, and enabled when a second arrives (REQ-25). The flows: each of the four opens from its entry **with no panel open**, showing the invoked row's image (REQ-13); with a panel open on a *different* image the flow is still the invoked one's and the panel is unchanged when it closes (REQ-14, REQ-15); opening one closes another already open (REQ-16); an image removed from the list while its flow is open resolves the flow (REQ-20). The panel: **invert, do not delete**, the existing assertions on its four actions — the panel now offers none of the four and nothing in their place (REQ-1, REQ-2) — while its contents, its dismissal by re-selecting its row and by `Escape`, and the selection and search behaviour change-3 verified all keep passing unchanged (REQ-3, REQ-29). | REQ-1, REQ-2, REQ-3, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-13, REQ-14, REQ-15, REQ-16, REQ-20, REQ-25, REQ-28, REQ-29 | INT-4, INT-5, INT-6 |
| INT-8 | modify | `client/e2e/images.spec.ts` | Against the real daemon, in the browser — the routes only a live list can show. **Delete nothing that is there**; every existing check keeps asserting the same daemon outcome (REQ-28, REQ-29). The menu: ten entries in order with their labels, two separators, no heading (REQ-5, REQ-6, REQ-7); the six existing operations still do what they did, `Remove` still confirming (REQ-8); on a dangling image `Untag`/`Push…` are still disabled with a readable reason (REQ-9); the ten-entry menu opens **in full** on a row at the bottom of a long list, inside the scrolled table, and over an open detail panel (REQ-10); one menu at a time, dismissal by entry, `Escape` and click-away with the focus back on the trigger, and full keyboard operation over ten entries (REQ-11, REQ-33). `Compare with…`: greyed with a list-naming reason when the list holds one image, and available once a second image is pulled or tagged **while the screen is open** (REQ-25, REQ-26). The four: opened from a row's `…` **with no panel open anywhere on the screen**, each shows that row's image (REQ-4, REQ-13, REQ-30); with a panel open on another image the flow is the invoked row's and that panel is untouched when it closes, and with no panel open none appears (REQ-14, REQ-15); with a flow open, `Escape` dismisses **nothing** beneath it — a panel open underneath is still open and the selection is unchanged (REQ-18); closing a flow leaves the point of interaction in the images list (REQ-19); removing the image from another terminal while one of the four is open on it resolves the flow (REQ-20). The panel: it carries **no action bar** and none of the four labels (REQ-1, REQ-2), and everything change-3 verified about it still holds (REQ-3, REQ-29). The list keeps updating on its poll and on daemon events with a ten-entry menu open (REQ-31). Test rules without exception: own fixtures with the ownership labels, `docker rm -fv` in a `finally`, assertions on its own fixtures rather than on totals or emptiness, no reach to Docker Hub, and the file passes when run on its own. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13, REQ-14, REQ-15, REQ-18, REQ-19, REQ-20, REQ-25, REQ-26, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33 | INT-4, INT-5, INT-6 |
| INT-9 | modify | `client/e2e/layer-explorer.spec.ts` | Its three tests reach the explorer through the row's `Explore layers…` entry instead of `selectRow(row)` then the panel button (lines 73–75, 100–101, 148–149). Each keeps proving exactly what it proved — the ordered layer stack of a registry-pulled image with its unavailable compressed size, the cost warning and its cancel, the changeset staying browsable after the dialog is dismissed (REQ-4, REQ-28). **At least one of the three opens the explorer with no row selected and no panel open**, which is the case that did not exist before and the reason this file is in the batch (REQ-13, REQ-30). Its helpers (`createStandaloneImage`, `waitForLayerStack`), its fixtures and its cleanup are untouched. | REQ-4, REQ-13, REQ-28, REQ-30 | INT-4, INT-6 |
| INT-10 | modify | `client/e2e/layer-efficiency-signals.spec.ts` | Every place this file opens the efficiency and signals view through the panel reaches it through the row's `Efficiency & signals…` entry instead, and each check keeps asserting the same findings (REQ-4, REQ-28). **At least one opening happens with no panel open** (REQ-13, REQ-30). Its coverage of the hand-off matters more than the entry point and must survive intact: choosing a finding closes this view and opens the layer explorer **at that layer with the analysis already primed**, and the explorer marks the layers carrying findings — that is REQ-17's first two clauses, and after this batch the state behind them lives on the screen rather than on the panel; if the file does not already drive both, it does now. Fixtures, cleanup and the cost-warning coverage are untouched. | REQ-4, REQ-13, REQ-17, REQ-28, REQ-30 | INT-4, INT-6 |
| INT-11 | modify | `client/e2e/filesystem-browser.spec.ts` | Every place this file opens the browser through the panel reaches it through the row's `Browse filesystem…` entry instead (REQ-4, REQ-28), with **at least one opening with no panel open** (REQ-13, REQ-30). The test that contracts reuse of a cached extraction on a second browse keeps contracting exactly that, through the new entry point: the analysis cache must be hit as it is today and nothing may re-extract what was already extracted (REQ-21) — a quietly lost cache hit passes and stops testing anything. The panel-dismissal check change-3 rewrote into this file stays and keeps passing. Its extraction, download and cleanup behaviour is not this batch's business and is untouched. | REQ-4, REQ-13, REQ-21, REQ-28, REQ-30 | INT-4, INT-6 |
| INT-12 | modify | `client/e2e/image-diff.spec.ts` | Its two `Compare with…` tests reach the comparison through the row's entry instead of `selectRow(rowA)` then the panel button (lines 108–109, 159–160), **at least one of them with no panel open** (REQ-4, REQ-13, REQ-28, REQ-30). The first also asserts REQ-23: the view **states** which image is the left-hand side, by the reference the row shows, over and above the pre-filled `First image` value it already checks. **Its third test — the bulk two-checkbox `Compare filesystems…`, opening with both sides pre-picked — stays exactly as it is and must pass unchanged**: it is the shape a single shared view is most likely to break and the one exercised least, and it is the only check standing behind REQ-35. Add the crossing case the single instance makes possible: the two shapes used one after the other in the same session, neither leaking its operands into the other's opening (REQ-35). Self-comparison stays unstartable (REQ-27). Its serial mode, its three built fixtures and its `afterAll` cleanup are untouched. | REQ-4, REQ-13, REQ-23, REQ-24, REQ-27, REQ-28, REQ-30, REQ-35 | INT-4, INT-5, INT-6 |
| INT-13 | modify | `client/e2e/layer-build-cache.spec.ts` | Its `openLayerExplorer` helper (lines 88–99) opens the explorer through the panel and is used by two of its three tests; re-point it at the row's `Explore layers…` entry, and both tests keep proving what they proved — the build step and cache record behind a locally built layer and the follow through to Builders & cache, and the stated reason a registry-pulled image has none (REQ-4, REQ-28). **Its third test is the REQ-69 cross-navigation guard — following a build-cache record's related image to Images & layers, the image selected and its layer explorer open at that layer — and it must pass *untouched*** (REQ-17). It is the only check standing between this batch and a silently broken cross-navigation, so if it needs editing to pass, the behaviour has changed and that is a defect of INT-2, not a test to adjust. Its fixtures, its marker-scoped build-cache cleanup and its retries are untouched. | REQ-4, REQ-17, REQ-28 | INT-4, INT-6 |

## Order

`INT-1` → `INT-2`, `INT-3`, `INT-4`, `INT-5` → `INT-6` → `INT-7` … `INT-13`.

INT-1 first: it creates the state the other product interventions consume. INT-2, INT-3, INT-4 and
INT-5 are independent of one another — that is the point of the split — but **INT-1, INT-2 and INT-6
land together**: between INT-1 and INT-6 the four flows exist in two places at once, and between
INT-1 and INT-2 the cross-navigation and the findings hand-off are broken. INT-6 last of the product
interventions, because removing the panel's copies before the screen holds them would take the four
capabilities off the product entirely. The test interventions follow, and none of them can be written
against a half-moved flow.

## Out of this batch

From the spec's own Scope, and not to be drifted into: **any change to what the four flows do,
compute, display, cache or cost** — only their entry point and their independence from the panel are
decided here; any change to the six existing menu entries' order relative to one another, labels,
hints, tone, confirmations, feedback or the API behind them; the image detail panel's contents,
layout, data, opening and closing behaviour and continued absence of a close control; **whether a
panel that shows only data still earns its place**, which nobody has asked; section headings, search,
scrolling or any other new capability of the menu component, and any images-specific variant of it;
**multi-select, bulk actions, a two-row comparison gesture or any selection-plus-toolbar design** —
the existing checkbox column and bulk bar are preserved, not extended and not absorbed into the menu;
**`Escape`-to-close on `Modal`, `FormDialog`, `FormSheet` or any confirmation**, none of which closes
on the key today and none of which this batch changes; the same reorganisation on any other screen;
the images screen's columns, sorting, search and top-level toolbar; keyboard shortcuts other than
`Escape` for dismissal; **making rows keyboard-operable disclosure controls**, which remains the
separate request change-2 recommended; any redesign of the liquid-glass material or any addition to
the blur allow-list; **editing `.sdd/analysis/docker_management_app-image_row_actions.md`**, whose
correction the human has already applied; and the three remaining items of `bugs.md`. No server code,
no endpoint and no Docker call is touched, and **no file under `client/src/ui/` is edited at all**.

## Human acceptance

**The panel.** On the Images & layers screen, selecting an image opens its detail panel and **there is
no action bar on it** — no `Explore layers…`, no `Efficiency & signals…`, no `Browse filesystem…`, no
`Compare with…`, nothing whatever in their place, and no gap or stray padding where the strip sat.
The header reads like the container panel's. Everything else is as it was: the same definition list,
the same Environment / Labels / History sections, the same raw payload; opened by its row, closed by
re-selecting that row and by `Escape`; no `✕`; gone when its image leaves the list; hidden and
restored by a search along with its row.

**The menu of ten.** The row's `…` opens ten entries in three groups: `Explore layers…`,
`Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — a separator — `Run…`, `Tag…`,
`Untag`, `Push…`, `Save` — a separator — `Remove`, in the destructive tone, with `rmi` beside it, and
still confirming before it removes. No section headings and no icons. The four newcomers keep their
trailing ellipses and carry no secondary text. The six older entries do exactly what they did:
`Run…` opens the create-and-run form pre-filled, `Tag…` asks for the reference, `Untag` untags at
once with one tag and asks which with several, `Push…` shows per-layer upload progress, `Save`
starts the download and toasts. On a `<none>` image the same ten appear in the same order with
`Untag` and `Push…` greyed and saying why. The menu opens in full on the last row of a long list and
over an open detail panel, one row's menu at a time, and works from the keyboard alone.

**The four, with no panel open.** With **no detail panel open anywhere**, open a row's `…` and choose
each of the four in turn. Each opens on that row's image and behaves exactly as it did from the
panel: the layer stack with its shared and signals markers and its cost-warned, cancellable changeset
analysis; the efficiency and signals view with its disclaimer and findings; the filesystem browser
with its extraction, tree, previews and downloads — and browsing the same image a second time still
reuses the cached extraction rather than extracting again; the comparison with its cost warning,
progress and tree. Opening one opens **no** panel and no row becomes selected. Now select a
*different* image so its panel is open, and open one of the four from another row's `…`: the flow
shows the row you invoked it from, not the selected one, and when it closes that panel is exactly as
you left it. Open a second of the four from a menu: the first is gone. With a flow open, press
`Escape`: nothing behind it is dismissed — a panel open underneath is still there and the selection
is unchanged. From the efficiency view, choose a finding: it closes and the layer explorer opens at
that layer with the analysis already run rather than behind its cost warning, and the explorer marks
the layers carrying findings. From Builders & cache, follow a record's related image: you land on
Images & layers with that image selected, its panel open, and its layer explorer open at the named
layer — exactly as before. Finally, with one of the four open on an image, `docker rmi` that image in
another terminal: the view resolves itself instead of sitting there showing an image that is gone.

**`Compare with…`.** Started from a row, the comparison opens with that row's image as the left-hand
side and **says so in the view**, by the reference the row shows; the right-hand side is unchosen and
is picked inside the view; changing the left one is still possible. With only one image in the list
the entry is greyed and its reason says **the list** has no second image to compare with — not that
anything is wrong with this image; pull or tag a second image with the screen open and the entry
becomes available. An image still cannot be compared with itself. The bulk path is untouched: check
two rows, choose `Compare filesystems…`, and the view opens with **both** sides pre-picked. Use both
routes one after the other: neither leaves the other's operands behind.

**Nothing else.** The toolbar and its pull, load, import and prune actions, the columns, the search,
the empty state, the checkbox column, the bulk bar, every dialog, the progress, the toasts and the
error reporting are as they were, and the Containers screen and every other screen are untouched.

**The batch's test runs are batch-scoped**, and the tester runs exactly these: `npm run lint`,
`npm run test:typecheck -w client`, `npm run test -w client` for this batch's unit file
(`images-screen.test.tsx`, with the UI conformance check included and
`client/scripts/check-ui-conformance.mjs` unmodified), and this batch's e2e specs
(`client/e2e/images.spec.ts`, `layer-explorer.spec.ts`, `layer-efficiency-signals.spec.ts`,
`filesystem-browser.spec.ts`, `image-diff.spec.ts`, `layer-build-cache.spec.ts`). **The full unit
suite and the complete e2e suite are not this batch's business**: the human runs them at the end, as
they did for the six items already certified. No server pass is in scope: nothing server-side is
touched.
