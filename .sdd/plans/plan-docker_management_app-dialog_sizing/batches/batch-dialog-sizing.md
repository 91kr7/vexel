---
batch: 1 · dialog-sizing
feature: F1 — A dialog's glass card is the size of the dialog it holds
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18]
depends: []
---

# Batch 1 — A dialog's glass card is the size of the dialog it holds

The glass card of a dialog and the content inside it are sized by two different rules and disagree.
One element is made to state the width, everything inside it fills that width, and the disagreement
becomes structurally impossible — for the eleven dialogs the human listed, for the four large ones,
and for every dialog added later. Two files change, both inside the UI library.

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not
restate it here.

## What is already true, and must stay true

Read before starting; these are the facts the interventions are written against, checked in the
`ui-library` index, the component specs and — where a spec could not settle it — the code itself.

- **The rendered structure of a dialog today** (`client/src/ui/feedback/Modal.tsx:29-39`):

  ```
  .ui-modal-overlay          the scrim: position fixed, inset 0, display grid, place-items center,
                             padding var(--space-6); a plain dim, backdrop-filter: none
    └ <div>                  no class at all — it exists only to stop the click reaching the scrim.
                             This is the grid item, and it is what the glass paints as.
        └ .ui-surface … .ui-overlay-glass    rendered by <Surface elevation="raised"
                                             material="overlay">; a plain block, no sizing of its own
            └ .ui-modal      width: min(480px, 100%); padding var(--space-6);
                             + .ui-modal--size-large → width: min(1100px, 92vw);
                               max-height: 85vh; overflow-y: auto
  ```

- **Why it goes wrong.** The classless div is a grid item under `place-items: center`, so it is sized
  `fit-content`. Computing that intrinsic width asks `.ui-modal` for its contribution, and **in
  intrinsic sizing a percentage is treated as `auto`** — the `100%` term drops out and the child
  contributes its **max-content** width: the longest run of text, unwrapped. The card adopts that;
  only afterwards does `.ui-modal` resolve `min(480px, …)` to 480px. Measured live at a 1280px
  viewport: prune unused networks 697/480, registry log in 719/480, create context 1016/480, registry
  log out 1117/480, system prune 1232/480 (that last one clamped by the grid track, so it would be
  wider on a wider screen). Short content inverts it: replacing the create-context description with
  one short word collapsed the **card** to 398px while `.ui-modal` stayed 480px — content 82px
  outside its own surface.
- **`FormSheet` already does it right, in the same stylesheet.** `client/src/ui/feedback/FormSheet.tsx`
  uses the same `.ui-modal-overlay` scrim, but its grid item carries a class and the width:
  `.ui-form-sheet__positioner { width: min(760px, 100%) }` (`feedback.css:302`) with
  `.ui-form-sheet { … width: 100% }` (`feedback.css:306`). One element states the width, the content
  fills it, and the two cannot disagree. **This batch makes `Modal` look like that.** It is the
  pattern to copy, not a pattern to improve on.
- **`Modal` is the base of everything.** `ConfirmDialog`, `FormDialog` and `TransferProgressDialog`
  are built on it and declare no positioning of their own, which is why one change reaches all eleven
  listed dialogs. `size="large"` is the same surface: image diff, layer efficiency, layer explorer and
  filesystem browser.
- **`Surface` contributes no sizing.** `.ui-surface` (`client/src/ui/glass/surface.css:1`) sets
  position, radius, border, background and shadow only — a block element that fills whatever box it
  is in. So a width on the grid item reaches `.ui-modal` unchanged.
- **These selectors are load-bearing far outside the library.** `.ui-modal-overlay` and `.ui-modal`
  are queried from **47 files** across `client/test/unit/` and `client/e2e/`. Add a class; do not
  rename, remove or re-nest a node. Anything that changes the shape of that subtree turns a two-file
  fix into a suite-wide rewrite, and that is not this batch.
- **The blur policy** (`CLAUDE.md`, `.sdd/modules/ui-library/specs/overlay-glass.md`): closed
  allow-list, one blur value, `.ui-overlay-glass` a named member of it. This batch adds no surface and
  declares no filter, so `client/scripts/check-ui-conformance.mjs` is **not edited**,
  `blurAllowedOverlaySelectors` gains nothing and the `CLAUDE.md` table gains no row (REQ-14). The
  scrim's `backdrop-filter: none` and the comment above it stay exactly as they are.
- **`Escape` is not this batch's business.** `Modal` claims the key and does nothing with it
  (`useEscapeClaim`, `plan-docker_management_app-container_detail_close/REQ-9`). Untouched.
- **jsdom measures nothing.** `getBoundingClientRect` returns zeros there, so no unit test can check
  this. The verification is in the e2e tree, in a real browser. A static assertion over the CSS text
  is **not** an acceptable substitute: it would check this fix's implementation instead of the
  required effect.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/feedback/Modal.tsx` | Give the classless grid item a class of its own — the modal's **positioner** — and put the size variant on it as well, so the element that is actually measured is an element the stylesheet can address (REQ-1, REQ-2, REQ-8). Follow the naming already in the file for the sheet's equivalent node. Everything else about the component is untouched: the same four nodes in the same order, the same `onClick` click-stopper on that div, the same `<Surface elevation="raised" material="overlay">`, the same `.ui-modal` / `.ui-modal--size-large` class names on the content, the same title/body/actions structure, the same `useEscapeClaim`, the same props and the same public API — **no new prop, no new export from `client/src/ui/index.ts`** (REQ-11, REQ-15). Do not rename or re-nest anything: 47 test files query this subtree by selector. No `style` prop, no inline value, no token read in TSX — the width is CSS and belongs in INT-2 (REQ-14, REQ-15). | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-11, REQ-12, REQ-14, REQ-15 | — |
| INT-2 | modify | `client/src/ui/feedback/feedback.css` | **Move the width, do not retune it.** `width: min(480px, 100%)` leaves `.ui-modal` and lands on INT-1's positioner class; `width: min(1100px, 92vw)` leaves `.ui-modal--size-large` and lands on the positioner's large variant; the content elements become `width: 100%`, exactly as `.ui-form-sheet` already is (REQ-1, REQ-2, REQ-6). **The values are unchanged** — 480px and `min(1100px, 92vw)` — and so is everything else on those rules: `.ui-modal` keeps its `padding: var(--space-6)` and its `z-index`, `.ui-modal--size-large` keeps `max-height: 85vh; overflow-y: auto` (the height cap belongs to the scrolling content, not to the positioner), and the ordinary dialog's content column must still measure 480px in total after the change (REQ-7, REQ-8, REQ-10). Touch nothing in the `.ui-modal-overlay` rule — its `place-items: center`, its `padding: var(--space-6)` (the clearance from the screen edges REQ-9 keeps) and its `backdrop-filter: none` with the comment explaining it all stay (REQ-9, REQ-11, REQ-14). Touch no `.ui-form-sheet*` rule: it is already correct and is the model here (REQ-13). Nothing about padding, radius, border, shadow, colour, typography or the glass material changes (REQ-11). Then record the rule in `.sdd/modules/ui-library/specs/modal.md`, under the component's rules and invariants: **the positioner states the dialog's width and the content fills it, so the card and the content cannot disagree — in either direction, at either size, at any viewport** — with one line on *why* (a percentage is treated as `auto` in intrinsic sizing, so a `min(…, 100%)` on the content made the fit-content grid item adopt the content's max-content width), one line saying that retuning the width means editing that one declaration, never re-splitting it across two elements, and one line saying that **a screen needing a dialog width of its own is a new requirement and a new decision** — a width variant is added to this component deliberately, never introduced on a screen and never discovered by a test. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15 | INT-1 |
| INT-3 | create | client e2e tree (`client/e2e/`), a spec of its own for the library's dialog surface | The check that measures the real thing, in a real browser. For each dialog it opens, compare **the width of `.ui-modal-overlay`'s first element child, the width of the glass surface inside it, and the width of `.ui-modal`**: all three agree within a pixel — not "the card is not much bigger", agreement in both directions (REQ-1, REQ-2, REQ-16) — and the same for their heights, so the vertical hug is asserted too (REQ-10). Cover, at a desktop viewport: an **ordinary** dialog with long copy — Contexts → Create context, a `FormDialog`, today's worst non-clamped case at 1016/480 and the one in `bugs-screen/bug-1.png` — and a second one that is a **`ConfirmDialog`** (a prune or the registry log-out), deliberately a different content composition rather than a second `FormDialog` — asserting also that the two are **the same width as each other** (REQ-5) and that the ordinary content column is still 480px (REQ-7); **three dialogs is the whole sweep, and that is a decision**: the `large` one below serves REQ-5 as well, and the remaining eight of the human's eleven are closed by construction, because once the width is stated in one place per-screen variation is not something a test could find — it is not something the code can express. Do **not** add the other eight screens. If a screen ever needs a width of its own, that is a new requirement and a new decision, never a discovery made here; the **constructed short-content case** (REQ-2, REQ-17), by replacing the open dialog's own description text with a short string in the page, re-measuring, and restoring it — this is the technique that produced the known 398-vs-480 instance, and it is the only way this mode is reachable; a **length-independence** pair (REQ-3, REQ-4), long text and short text through the same dialog giving the *same* width, which is what proves a width driven by a long registry hostname cannot come back; a **large** dialog (REQ-5, REQ-8, REQ-18) — Images & layers → `Explore layers…` on `vexel-test-tiny:1`, reached exactly as `client/e2e/layer-explorer.spec.ts` reaches it (`ensureImage(TINY_IMAGE)`), asserting agreement **and** that it is still the wide format, not narrowed to the ordinary width; the same ordinary and large dialogs at a **narrow (phone-width) viewport** (REQ-9, REQ-18), where they are bounded by the screen rather than by their designed width, with nothing overflowing horizontally and the scrim's clearance intact; and **`FormSheet`** (REQ-13) — Containers → the create-container form, opened and cancelled — measured the same way and expected to pass **before and after** the fix. Test rules apply without exception: import `test` from `client/e2e/support/test.ts`, pin the screen with `openApp`, create no Docker object of your own, **open and cancel every prune/removal dialog and never confirm one** (so this spec is non-destructive and does not belong in `client/e2e/exclusive/`), and pass when the file is run on its own. Keep the measurement function local to this spec — one caller does not need a `support/` helper. **Write this before INT-1 and INT-2 and run it against the unfixed build: it must be seen failing, on the ordinary dialogs and on the constructed short-content case, before it is seen passing.** | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13, REQ-16, REQ-17, REQ-18 | — |
| INT-4 | modify | `.sdd/modules/ui-library/specs/form-sheet.md` | Record the outcome REQ-13 asks for, durably and with its reason: **`FormSheet` was checked against both failure modes for `plan-docker_management_app-dialog_sizing` and is unaffected — its own positioner states its width and its content fills it, which is the arrangement `Modal` was corrected into, and it is measured by INT-3.** One short entry under the component's rules and invariants. Nothing about `FormSheet` changes — no file under `client/src/ui/feedback/` is edited for this, and its width stays 760px. If INT-3 shows it *is* affected: **stop, and report it with the measurement as a new defect — do not fix it here, and do not absorb it into this batch.** Two reasons, both decided at the coverage gate. A batch that quietly grows a second fix when a check surprises it is a batch whose acceptance criteria no longer describe it. And more practically: if `FormSheet` were affected, the diagnosis this whole batch rests on would be wrong — the correction is modelled **on** `FormSheet` being right — so that is a reason to stop and rethink, not to patch a second surface with a pattern just shown to be unsound. | REQ-13 | INT-3 |

## Order

`INT-3` (written and **seen red**) → `INT-1` → `INT-2` → `INT-3` re-run (green) → `INT-4`.

The verification comes first on purpose. It is the one deliverable that cannot be checked after the
fact: a check written against corrected code passes trivially and proves nothing about whether it
detects the defect. `INT-1` and `INT-2` are one change in two files and must land together — between
them the positioner has a class and no width, which sizes nothing. `INT-4` records what `INT-3`
observed, so it comes last.

## Out of this batch

From the spec's own Scope, and not to be drifted into: **bug-2 and bug-3** and the two remaining
`bugs.md` items; **any redesign of `FormSheet`** — it is verification-and-report only; **any change to
the dialog widths themselves** (480px and `min(1100px, 92vw)` are preserved, not revisited), to the
dialog's padding, radius, typography, scrim, glass material or placement; **any edit to a dialog's
wording, contents, validation or behaviour**, including shortening prose to make a card look better;
**any change to `client/scripts/check-ui-conformance.mjs`, to `blurAllowedOverlaySelectors` or to the
`CLAUDE.md` blur table**; **`Escape` behaviour on dialogs**; non-dialog surfaces — panels, menus,
popovers, toasts, drawers — none of which is implicated by the evidence; and any styling placed in
feature code to compensate locally. No server code, no endpoint, no Docker call is touched, and no
dependency is added.

## Human acceptance

At a 1280px viewport, open **Contexts → Create context**: the glass card ends where the content ends
— no band of empty glass to the right of the text — and in the inspector the overlay's first element
child, the glass surface and `.ui-modal` all read **480px**, where the card read 1016px before. Do
the same for **Registries → Log in** (was 719), **Registries → Log out** (was 1117), **Volumes &
networks → both prune dialogs** (one was 697), **System & prune → System prune** (was 1232, filling
the viewport), **Containers → prune stopped**, **Images & layers → import filesystem**, **Swarm →
initialize swarm** and **join swarm**, **Builders & cache → create builder**, **Plugins → install
plugin**: every one of them is now **the same width as every other**, and each is the width of its
own content. Log out of a registry with a long hostname and one with a short one: the same width for
both. Narrow the window to phone width and reopen a couple of them: the card still ends where the
content ends, the dialog keeps its margin from the screen edges, and nothing runs off the side. Open
a **large** dialog — Images & layers → `Explore layers…`, the layer-efficiency view, an image diff,
the filesystem browser: still wide, still `min(1100px, 92vw)`, card and content the same width, and
its inner scrolling unchanged. Open **Containers → Create container**: the sheet is unchanged at
760px, card and content in agreement as they already were. Nothing else about any dialog moved: same
glass, same padding, same typography, same placement, same dimmed scrim, same open and close, same
wording, same behaviour.

**The batch's test runs are batch-scoped**, and the tester runs exactly these: `npm run lint`,
`npm run test:typecheck -w client` (the only pass that typechecks the e2e tree), `npm run test -w
client` — the whole client unit pass, because this batch touches a subtree 47 test files query by
selector, with the UI conformance check included and `client/scripts/check-ui-conformance.mjs`
unmodified — and the batch's single e2e spec, `client/e2e/dialog-sizing.spec.ts`. That spec must
have been **observed failing on the pre-fix build** before being observed passing; report both. The
`FormSheet` outcome is reported here and recorded in
`.sdd/modules/ui-library/specs/form-sheet.md`. **The full unit suite and the complete e2e suite are
not this batch's business**: they run once at the end, after every item of `bugs.md` has been
certified — bug-1 is the fourth of six and is not that end. No server pass is in scope: nothing
server-side is touched.
