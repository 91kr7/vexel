---
slug: docker_management_app-filesystem_browser_layout
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-filesystem_browser_layout.md
status: validated
---

# Requirements — The filesystem browser gives its height to the filesystem

Fix of the delivered product; bug-3 of the human's `bugs.md`. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md). Three delivered,
certified siblings bound this one and are **baseline, not part of it**:
[`plan-docker_management_app-dialog_sizing`](../plan-docker_management_app-dialog_sizing/requirements.md)
(the dialog's outer box — designed width, 85vh cap, scroll backstop),
[`plan-docker_management_app-progress_completion_autoclose`](../plan-docker_management_app-progress_completion_autoclose/requirements.md)
(bug-1) and
[`plan-docker_management_app-filesystem_browse_direct`](../plan-docker_management_app-filesystem_browse_direct/requirements.md)
(bug-2, which removed a surface from **this very flow**, so the layout described below is the
*current* one). Ids are local to this plan: `REQ-1` here is *not*
`plan-docker_management_app/REQ-1`.

**Three causes, one reported symptom.** A shared search band sized `flex: 1 1 240px` — a row-axis
rule read as *240px tall* when the band is placed in a column, which is the whole of both ~110px
voids. A tree-and-detail region pinned to a pixel height in feature code, so it is 480px whether the
dialog is 600px or 1400px tall. And a body that consequently overflows the dialog's own cap and
scrolls twice. All three are corrected together, and **both of the first two are corrected in the UI
library**, where they live.

**The outcome is measured geometry, not appearance.** "The tree is visible", "13 entries are listed"
and "522 entries" are all true of the bug screenshot itself. The numbers in F1's third block are
therefore stated as figures, at stated viewports, and a check that cannot fail on the delivered build
certifies nothing. Those floors are derived from the delivered 32px row and the delivered 85vh cap;
if either is deliberately changed by a later report, the numbers are restated from the same
reasoning — they exist to make the outcome fail-able, not as design constants.

## F1 — The dialog's interior distributes its height by intent

### Interior layout

| ID | Requirement |
| --- | --- |
| REQ-1 | **No interior void.** Between any two consecutive bands of the dialog's body there is exactly the surface's own band spacing and nothing more. Measured: no vertical gap inside the body exceeds twice the spacing used between the status row and the note on the same surface — and in absolute terms, **no interior gap exceeds 32px at any viewport size**. |
| REQ-2 | **Chrome is intrinsic, one region is elastic.** The bands that state things — the title, the status pill with `Re-extract…` and the `Download whole filesystem…` control, the scaffolding note, the refused-entries note when present, the search field with `Previous`/`Next`, the truncated-matches note when present — each occupy the height of their own content and no more. **The tree-and-detail region is the single region that absorbs all remaining height, and it is the only one.** |
| REQ-3 | **A control never claims height it does not use.** The search band occupies the height of the control it contains, in a column exactly as in a row. The corrected behaviour belongs to the **shared control**, so a future column use of it cannot reproduce the defect; the 240px is not "tuned down" to a smaller constant, because the value is not the defect — the band claiming height on the block axis is. |
| REQ-4 | **The container logs view, the band's one other user, is still correct afterwards** — it wraps the band in a horizontal row, the axis the band was written for, and its width behaviour (at least 240px, and grow) is unchanged there. This is verified, not assumed. |
| REQ-5 | **The library gains a way to express "these bands are chrome, this region takes the remaining height".** It is added to `client/src/ui/`, generic and domain-agnostic, with a typed public API and no knowledge of Docker concepts, and it is added **before** the feature composes it. An existing primitive that almost fits is extended rather than duplicated. |
| REQ-6 | **The dialog's body does not scroll as a whole.** At viewport heights of 600px and above there is exactly **one** scrollable region visible in this dialog's body — inside the tree — plus the detail pane's own when its content is long. The surface must not present a scrollbar around content that already has one. Below 600px of viewport height the shared dialog's existing scroll backstop may engage, and that is not a defect. |
| REQ-7 | **The card is still the size of its content.** When the content genuinely needs less height than the cap allows — an image with a handful of root entries, an empty filesystem, the brief loading state — the dialog is **as short as its content**, with no band of empty glass below it. The elastic region takes the *available* height only when it has something to do with it; a dialog that is always 85vh tall regardless of its content trades this defect for the one fixed two reports ago. |
| REQ-8 | **The layout holds in every state of this surface**, not only the screenshot's: while the kept result is being read (the loading indication bug-2 introduced), freshly extracted, from cache, with the refused-entries note present, with the truncated-matches note present, with an empty filesystem, with a file / a directory / a symlink selected, and with a long text or hex preview open in the detail pane. A height budget that only balances for the screenshot's four bands is not a fix. |

### The two panes

| ID | Requirement |
| --- | --- |
| REQ-9 | **The tree and the detail pane stay side by side while there is room for both**, and **stack vertically below the library's existing narrow breakpoint**, tree first, with the tree keeping the larger share of the height. No new breakpoint is invented for this surface: the product has one set, and one visual language. |
| REQ-10 | **The idle detail pane does not present a full-height void.** With nothing selected, its placeholder states what it states today (`No entry selected` and its one-line explanation) **compactly and at the top of its column**, not centred in an empty column the height of the tree. |
| REQ-11 | **Selecting an entry does not move the tree.** The panes keep their positions and their widths whether or not an entry is selected: the row the operator just clicked must still be under the pointer afterwards. A layout that widens the tree while it is idle and re-narrows it on selection is refused for this reason. |
| REQ-12 | **The detail pane's content scrolls within the pane**, so that a long preview lengthens no dialog and moves no tree. |

### The stated, verifiable outcome

| ID | Requirement |
| --- | --- |
| REQ-13 | **At 1280 × 720, browsing an image whose root directory holds at least a dozen entries, the operator sees at least 10 entries without scrolling the tree** — against about 3 on the delivered build. **If both conditional notes are present the floor is 8.** |
| REQ-14 | **At 1280 × 720 the tree-and-detail region measures at least half of the dialog's inner height.** |
| REQ-15 | **The region grows with the viewport**: at 1280 × 1000 the region is measurably taller, and **strictly more entries are visible**, than at 1280 × 720. The delivered build shows the same 480px in both. |

### Nothing else changes

| ID | Requirement |
| --- | --- |
| REQ-16 | **Every control on this surface survives, in place, with its label and its behaviour**: the title naming the image, the freshly-extracted / from-cache pill with its entry count, `Re-extract…`, `Download whole filesystem…`, the scaffolding note, the refused-entries note, the search field with `Previous` and `Next`, the truncated-matches note, the lazily-expanding tree with its search highlighting and keyboard navigation, the metadata list, `Text`/`Hex`, `Download`, `Download this folder…`. Nothing is added, removed, renamed or reworded. |
| REQ-17 | **No flow changes.** The two shapes bug-2 delivered — cost warning first when nothing is kept, tree directly when a result is kept — are untouched, as are bug-1's progress dialog and its self-dismissal, the cost warning's wording and its numbers. |
| REQ-18 | **The tree's row and its density are unchanged.** This fix is about how much height the region gets, not about fitting more rows into less of it: row height, glyphs, typography and the surface's visual treatment stay as delivered. |
| REQ-19 | **Nothing on the daemon side changes**: no new Docker operation, no change to extraction, caching, cancellation, search, preview or download behaviour, and no change to any server response. |
| REQ-20 | **Nothing outside this surface is re-laid-out.** The three sibling large dialogs — image diff, layer efficiency, layer explorer — are **deliberately left as they are**, so that a regression on any of them stays attributable to the report that asked for it. Their pixel constants in feature code remain a standing-rule breach, recorded here, awaiting their own report; they are not quietly re-pointed at REQ-5's primitive in this fix. The images list and the row overflow menu are likewise untouched. |

### Non-functional

| ID | Requirement |
| --- | --- |
| REQ-21 | **Feature code states no pixel height on this surface at all.** The `maxHeight` pixel constants currently in the filesystem browser go with the fix rather than being replaced by smaller ones — they are themselves a breach of the standing rule that no size is hard-coded outside the library. |
| REQ-22 | **No raw markup, no CSS and no hard-coded spacing, size, radius, colour or z-index outside the library.** A negative margin, a local stylesheet or an inline height on the feature screen is not an acceptable outcome of this report under any schedule pressure. |
| REQ-23 | **The blur allow-list is untouched.** This surface is not on it and does not join it; the dialog's overlay glass keeps exactly the standing it has, the scrim keeps blurring nothing, and `client/scripts/check-ui-conformance.mjs` is **not modified** and passes. |
| REQ-24 | **`dialog_sizing`'s delivered behaviour survives and is re-verified here**: the dialog's width remains a designed constant stated in one place, the card remains the size of its content in both directions, and this is confirmed at narrow viewports as well as at desktop widths. The outer box — width, 85vh cap, glass, scrim, scroll backstop — is not reopened. |
| REQ-25 | **The tree stays fast with hundreds of entries.** Whatever gives the region its height must still leave the tree a **bounded, measurable height**, so that its virtualised scrolling keeps working: 522 entries with directories expanded scroll without stutter. "Grow to fit" instead of "fill and scroll" is refused. Nothing scroll-driven or animated is added to a surface drawn over the main view. |
| REQ-26 | **Keyboard and assistive-technology operation must not regress.** Reading and tab order stay as they are; the tree keeps its keyboard navigation; and a selection or a search hit that moves the highlighted row scrolls **the tree**, never the dialog — a failure only possible while the body is a second scroll container. |
| REQ-27 | **The three sibling large dialogs and the container logs view are verified unaffected, and the outcome is stated explicitly rather than assumed**: image diff, layer efficiency, layer explorer, and the one other user of the search band. They share the components being changed. |
| REQ-28 | The module indexes and component specs under `.sdd/modules/` are brought into line with what this fix changes: the search band's axis behaviour, the new library primitive and its contract, the filesystem browser's band structure and its one elastic region, and the recorded fact that the three sibling dialogs still state pixel heights and are awaiting their own report. **English only**, per the project's convention, and kebab-case for any new file name. |

### How this is checked

| ID | Requirement |
| --- | --- |
| REQ-29 | **The checks assert geometry: measured viewport boxes.** The tree region's measured height against the dialog's measured inner height; the measured vertical distance between consecutive bands; the number of rows deduced from the region's measured height; and the absence of a second scroll container around the body. Nothing in this report can be certified by reading text. |
| REQ-30 | **Content assertions are not a substitute and must not stand alone.** *"The tree is visible"*, *"13 entries are listed"* and *"522 entries is displayed"* are all true of the screenshot in the bug report; a check built on them passes on the delivered defect. They may stand beside the geometric assertions where they answer a different symptom, never instead of them. |
| REQ-31 | **Every interaction is driven with a real pointer at the visible control's coordinates** — the row's overflow control, the menu entry, the cost warning's buttons, a tree row, the search field, `Next` — never by calling an element's `click()`, never by dispatching an event, and never by aiming at a visually hidden element. |
| REQ-32 | **The checks are observed failing on the delivered build**, before the correction exists, and the implementer reports **the measurement produced before the fix and after it**. The delivered build's own numbers are on record: ~110px voids, a 480px region at every viewport, two scrollbars, ~3 rows visible at 1280 × 720. A check that passes on both builds certifies nothing; this project has already certified one defect behind coverage that could not fail. |
| REQ-33 | **The fixture is an image with enough root entries to make the count meaningful** — the mirrored `alpine:3.20` already used by this suite has thirteen — and the check **establishes its own extracted state** rather than inheriting one. |
| REQ-34 | **The states that no screenshot in the report contains are covered too**: both conditional notes present (REQ-13's floor of 8), an empty or near-empty filesystem opening a short dialog with no empty glass below it (REQ-7), the narrow viewport where the panes stack (REQ-9), and a long preview scrolling inside the detail pane without moving the tree (REQ-11, REQ-12). |
| REQ-35 | **The search band's row-axis behaviour is covered by a check that fails if it regresses** (REQ-4), so that a change made for a column cannot move the defect to the container logs view — a screen nobody in this report is looking at. |
| REQ-36 | The verification obeys the project's test discipline against the real daemon: its own fixtures carrying the ownership labels, removed in full in a `finally` (containers with `docker rm -fv`), no assumption of an empty daemon, no inherited application state, its own data directory, **no test reaching Docker Hub** (the image comes from the run's own registry), and **every spec passing on its own**. |
