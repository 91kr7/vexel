---
batch: 1 · filesystem-browse-direct
feature: F1 — Choosing `Browse filesystem…` opens the filesystem, not an offer to open it
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32]
depends: []
---

# Batch 1 — filesystem-browse-direct

Requirement texts live only in
[`../requirements.md`](../requirements.md); they are cited here by id.

**Order.** INT-1 to INT-6 are written and **run against this build first**, before INT-7 to INT-10
exist, and observed failing (REQ-30). Then the product interventions, then the documentation.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/e2e/filesystem-browser.spec.ts` | Rewrite all three delivered tests onto the corrected flow. **Shape A**: at the moment the row action is chosen, the cost warning is present with its image name and `taking roughly Ns`, **and** `Filesystem not extracted yet` and a `Browse filesystem…` control inside the surface are absent — asserted then, and again after confirming, after the tree arrives and at the end of the test; confirm → progress → `Completed` → self-dismissal (`expectCompletedThenSelfDismissed`, unchanged) → tree, `Freshly extracted`, entry count, lazy expansion and entry details as today. **Decline and cancel**: declining the warning leaves nothing open and nothing extracted, with the row action still on the row; a started extraction cancelled from the progress dialog returns to the images list with no prompt anywhere. **Shape B**: after a first extraction, close the browser (discarding its client state) and re-open from the row — no `Confirm:` dialog and no `Extracting the filesystem` dialog **at any point across a sustained window**, the tree present, marked `From cache` with its entry count, and **no request to the extraction stream issued during the open**; then `Re-extract…` from inside it raises the warning again. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, REQ-8, REQ-10, REQ-11, REQ-15, REQ-18, REQ-20, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-29, REQ-30, REQ-31 | — |
| INT-2 | modify | `client/test/unit/` — `filesystem-browser.test.tsx`, `images-screen.test.tsx`, `image-filesystem-client.test.ts` | Rewrite the component-level checks that drive the removed screen, and cover what e2e cannot reach honestly: opening with no kept result raises the cost warning immediately and renders nothing actionable behind it while the shape is being decided; opening with a kept result renders the tree with no warning and no progress dialog; declining and cancelling both call `onClose`; a failed extraction reports its cause, does not auto-dismiss and offers its retry inside the report; **a kept result that has vanished between the decision and the read falls back to the cost warning** (REQ-14); the keyboard lands on the warning, and on the tree in shape B. Extend `images-screen.test.tsx`'s mocks for the read the mounted browser now performs, and `image-filesystem-client.test.ts` for the new call's kept / not-kept answers. | REQ-1, REQ-6, REQ-9, REQ-14, REQ-21, REQ-29, REQ-30 | — |
| INT-3 | modify | `server/test/api/image-filesystem-routes.test.ts` | Cover the kept-result read against the real daemon: absent for an image never extracted; present after one extraction, carrying the entry count and refused count the extraction reported; answered from the content-addressed cache, so a rebuilt image reusing the same tag reads as absent; and **creating no container and issuing no daemon call** — asserted by there being no intermediate-extraction container at any point and by the read answering with the daemon's own listing untouched. Own fixtures with ownership labels, `docker rm -fv`, full cleanup. | REQ-13, REQ-16, REQ-17, REQ-31 | — |
| INT-4 | modify | `client/e2e/filesystem-browser-operations.spec.ts` | Re-point its `openAndExtract` helper: the row action now lands on the cost warning directly, so the `Browse filesystem…` press inside the modal goes and the `Extract` confirmation follows the row action. Everything the file then checks — search, preview, per-file/per-folder/whole-tree download, re-extraction — is unchanged and must still pass, which is what makes it this batch's evidence for REQ-11. | REQ-11, REQ-27, REQ-29, REQ-31 | — |
| INT-5 | modify | `client/e2e/images.spec.ts` | Three occurrences drive the browser from the row menu. In the four-views hosting loop, keep the filesystem entry and let the cost warning be its way out (the surface is open behind it, so the `Filesystem — <tag>` heading assertion stands); in the `Escape` test, move its two occurrences to a view whose first surface is not a dialog (`Explore layers…`), since `Escape` now correctly answers the warning — the hosting rule keeps its coverage, this flow is not what that test is about. The menu's entries, their order and their labels are asserted unchanged. | REQ-22, REQ-27, REQ-29, REQ-31 | — |
| INT-6 | modify | `client/e2e/layer-efficiency-signals.spec.ts` | **Relocate bug-1's cached-run coverage here — never delete it.** After the delivered first analysis, discard the view's client state (close the modal, as the filesystem check did) and re-open from the row: the view is back on its own `Not analyzed yet` screen (out of scope here, untouched), `Analyze layer efficiency…` is chosen and confirmed, and the run is served from the shared changeset cache — **no phase is reported at all** — so the dialog must read `Completed` rather than `Starting…` and then leave on its own (`expectCompletedThenSelfDismissed`). Cite `plan-docker_management_app-progress_completion_autoclose/REQ-2, REQ-22` in the comment, and say in one line that it moved here because this fix removes the dialog from the cached filesystem path. | REQ-27, REQ-28, REQ-31 | — |
| INT-7 | create | server, image-analysis module — the filesystem read surface | Expose the kept extraction's summary as a **plain read**: whether a result is kept for this image's content, and, when it is, its entry count and refused count (the same figures `FilesystemExtractionResult` carries, `fromCache` being true by construction). Cache lookup only — no daemon call, no container, nothing written, no extraction started — and an explicit "nothing kept" answer rather than an error. Keyed by image content exactly as the extraction cache is, so a rebuilt image reusing a tag reads as absent. | REQ-4, REQ-13, REQ-16, REQ-17, REQ-20 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6 |
| INT-8 | modify | `client/src/data/image-filesystem-client.ts` | Add the typed call for INT-7's read, distinguishing **kept** from **not kept** as two normal answers — absence is not an error here, unlike the existing tree/metadata calls whose `404` means "extract first". | REQ-4, REQ-16 | INT-7 |
| INT-9 | create | client, images module data layer (`client/src/data/`, the image-filesystem hooks family) | The hook the browser reads the answer through, following the family's existing shape: the kept / not-kept answer with its summary, its in-flight state (so the surface can show an actionless indication), and a re-read on the image changing. It must also report the case where a result answered as kept turns out unreadable on the follow-up read, so the caller can degrade to the cost warning. | REQ-4, REQ-6, REQ-14 | INT-7, INT-8 |
| INT-10 | modify | `client/src/images/FilesystemBrowser.tsx` | **Delete the `EmptyState`** — heading, paragraph and its `Browse filesystem…` button — and replace the flow's entry with the two shapes. On open: read INT-9's answer; **not kept** → raise the existing `ConfirmDialog` immediately, unchanged in wording, numbers and never-started guarantee, with the surface open behind it carrying only its title (and a `Spinner` while the answer is in flight — nothing actionable, no heading, no button); **kept** → load the tree directly, `StatusPill` reading `From cache` with its entry count, no `ConfirmDialog` and no `TransferProgressDialog` raised at all. Declining the warning, and cancelling a running extraction, both close the surface (`onClose`) instead of falling back to a prompt; a failure keeps reporting its cause with the retry offered inside the report, and dismissing it closes the surface. A kept result that cannot be read degrades to the cost warning. `Re-extract…`, the extracted view and everything in it are untouched; one code path, so any caller of this component inherits both shapes. No raw markup, no local style, no new blur surface. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-16, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | INT-7, INT-8, INT-9 |
| INT-11 | modify | `.sdd/modules/images/` and `.sdd/modules/image-analysis/` | Bring the indexes and specs into line: `images/specs/filesystem-browser.md` (the empty state gone, the two shapes and where each is decided, the re-homed decline/cancel/failure exits, the actionless wait), `images/specs/image-filesystem-client.md` and a spec plus index row for INT-9's hook, `image-analysis/specs/image-analysis-endpoints.md` and `filesystem-extraction-service.md` for INT-7's read, and the one-line responsibilities in both `index.md` files. State explicitly that a reused result raises **no** progress dialog on this path while it still does on the layer analyses, and why. | REQ-32 | INT-7, INT-8, INT-9, INT-10 |

## What the implementer must not get wrong

- **The shape is decided by INT-7's read, before anything is raised.** Starting the extraction stream
  and hiding the surfaces once the server answers `fromCache: true` is the shape this batch exists to
  refuse (REQ-16): it leaves the operator's second open still paying for an operation, and INT-1's
  extraction-stream witness fails it.
- **Shape B's absence is sustained, not instantaneous.** Assert across the window in which the two
  dialogs would have appeared. An assertion made in the same tick as the open passes on a product
  that raises them a moment later.
- **`Freshly extracted` / `From cache` and the entry count are the reuse claim.** They are the reason
  INT-7 returns a summary and not just a boolean; dropping the count would trade a redundant screen
  for lost information (REQ-20).
- **INT-6 is a move, not a deletion.** If, on inspection, the relocated scenario cannot report "no
  phase at all" on `layer-efficiency-signals.spec.ts`, stop and ask the orchestrator rather than
  weakening it — `layer-explorer.spec.ts`'s changeset analysis is the same cache and the obvious
  second candidate, but the choice is not the implementer's to make silently.
- **Nothing outside this flow moves.** `Efficiency & signals…` keeps its own `Not analyzed yet`
  screen — same shape, deliberately its own report; `Explore layers…`, `Compare with…`, the images
  list and the row menu are untouched.

## Verification

**Test runs in this batch are batch-scoped, in both phases (development and test).** What is run:

- `npm run lint`
- `npm run test:typecheck -w client` and `npm run test:typecheck -w server`
- `npm run test -w client` (the client unit tests, which include the UI-conformance check)
- the touched server API file on its own: `client/e2e`-independent, `server/test/api/image-filesystem-routes.test.ts`
- this batch's own e2e specs, **each run on its own**: `filesystem-browser.spec.ts`,
  `filesystem-browser-operations.spec.ts`, `layer-efficiency-signals.spec.ts`, `images.spec.ts`
  (REQ-31 — every spec must pass alone, which is also what makes this scoping legitimate).

**Neither phase launches the complete unit suite or the complete e2e suite.** The human has
instructed that both run **once, at the end of the whole five-report tranche**, on his own daemon;
a subagent starting a full run competes with him on that same daemon and fails in plausible-looking
places. If a change appears to need wider coverage than the list above, that is a question for the
orchestrator, not a reason to widen the run.

- INT-1 to INT-6 are run **before** INT-7 to INT-10 exist and reported with what failed (REQ-30).
