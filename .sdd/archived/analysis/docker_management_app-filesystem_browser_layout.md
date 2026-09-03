---
request_slug: docker_management_app-filesystem_browser_layout
date: 2026-08-14
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> popup style is not correct
> how to fix: analyse the screenshot! there are a lot of spaces not used! fix and ehance the layout!

Reported as bug-3 in `bugs.md`, with `bugs-screen/bug-3.png`. The text is two lines and the screenshot
is the whole report, so it is transcribed here as the requirement it is. It shows the **image
filesystem browser**, titled `Filesystem — alpine:3.20`, opened over the Images & layers screen and
occupying nearly the full viewport. Reading it top to bottom:

- the title;
- one line carrying the `From cache · 522 entries  Re-extract…` status pill on the left and the
  `Download whole filesystem…` button on the right;
- the scaffolding note (`Includes container-creation scaffolding (e.g. .dockerenv, dev/, etc/hostname,
  proc/, sys/) written by Docker itself, not necessarily shipped by the image.`);
- **an empty band of roughly 110 CSS px**;
- the search field with `Previous` / `Next`;
- **a second empty band of roughly the same size**;
- and only then the tree, beginning more than half-way down the surface and running off the bottom
  edge — `.dockerenv`, `bin`, `dev`, `etc`, `home`, `lib`, `media`, `mnt`, `opt`, `proc`, `root`,
  `run`, `sbin` — with a scrollbar of its own, beside a right-hand pane reading `No entry selected`
  centred in a tall empty column.

Two further details of the screenshot matter and are easy to miss: there is a **second scrollbar at
the dialog's right edge**, so the whole surface scrolls as well as the tree inside it; and the tree is
**cut off by the bottom of the viewport**, so the dialog is taller than the screen it is drawn on.

The operator can see about a dozen of 522 entries while roughly 40% of the surface is empty space
between three bands of chrome. The product's own file browser is showing less of the filesystem than
it is showing of itself.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](docker_management_app.md).

Three delivered siblings bound this one and are the baseline, not part of it:

- [`docker_management_app-dialog_sizing.md`](docker_management_app-dialog_sizing.md) — settled the
  dialog's **outer box**: a dialog's width is a designed constant stated in one place, the card is
  the size of the content it holds, and the large-format dialogs (image diff, layer efficiency, layer
  explorer, filesystem browser) legitimately need more room than an ordinary one. That decision is
  sound and is preserved here; this report is about the **interior** of that box.
- [`docker_management_app-progress_completion_autoclose.md`](docker_management_app-progress_completion_autoclose.md)
  (bug-1) — the shared progress dialog states `Completed` and dismisses itself a second later.
  Untouched.
- [`docker_management_app-filesystem_browse_direct.md`](docker_management_app-filesystem_browse_direct.md)
  (bug-2) — **the same surface as this report, changed under it**: the `Filesystem not extracted yet`
  empty state is gone from the product, `Browse filesystem…` leads straight to the cost warning, and
  an image whose extraction is still kept opens directly to the tree. Everything analysed below is
  read from the **current** code, after that change; the screenshot's build merely reached this view
  through one more screen than the product now has.

**Starting point.** The reference analysis makes runtime-independent filesystem inspection a stated
differentiator: any image's merged filesystem browsable as a tree without running the image,
searchable, with per-entry metadata, preview and download. It also stakes the product's market
position on a visual language that *"must remain usable (readable text, discernible controls) for
extended operational use, not purely decorative"*. The delivered browser has every capability the
reference analysis asked for. What it does not have is a layout: the height of the surface is
distributed by accident rather than by intent, and the region the whole feature exists to show is the
one that gets least of it.

**Changes.** This request adds no capability and removes none. No control disappears, nothing is
renamed, no wording changes, no operation behaves differently. What changes is **where the surface's
height and width go**: chrome takes what it needs, the tree and its detail pane take everything else,
and the two empty bands cease to exist. The cause is corrected where it lives — in the UI library —
rather than papered over on the screen that shows the symptom.

## Established findings

Read from the delivered product before writing this analysis, because "there are a lot of spaces not
used" names a symptom and a fix aimed at a symptom is a negative margin. Recorded so a later reader
can weigh the conclusions rather than take them on trust.

| Question | What was found |
|---|---|
| **Where do the two voids come from?** | From a **row-axis sizing rule applied in a column**. The search band is a shared library control that carries its own flex sizing, `flex: 1 1 240px`, and centres its contents on the cross axis. That declaration is written for a horizontal toolbar, where it reads *"at least 240px wide, and grow"*. In this dialog the band is placed as a direct child of a **vertical** stack, where the same declaration reads *"240px **tall**, and grow"* — so a ~36px control is centred inside a 240px band, leaving ~100px of emptiness above it and ~100px below. That is the whole of both voids, and it is why they are equal, symmetric and unrelated to any spacing decision. It is not deliberate spacing, and there is no gap to remove: there is a band that should not be claiming height. |
| **Is that band misused anywhere else?** | **No.** The same control is used in one other place, the container logs view, where it is wrapped in a horizontal row — the axis it was written for — and behaves correctly. The filesystem browser is the only column-context use in the product, and therefore the only surface showing the voids. The *cause*, however, is in a shared component and is silent: it produces no error, and any future column use reproduces the defect exactly. |
| **Why does the tree not simply take the remaining height?** | Because **nothing in the body is asked to absorb it**. The tree region and the two-pane split around it are given a **fixed 480px** height by the feature, stated as a pixel constant in feature code. The dialog can be 600px tall or 1400px tall; the tree is 480px either way. Every band in the body has an intrinsic height and none of them is elastic, so "remaining height" is a quantity the layout never computes. |
| **Why are there two scrollbars?** | The shared dialog surface caps a large dialog at **85% of the viewport height and gives it its own vertical scroll** — correct and necessary as a backstop. The body's own height (title + status row + note + a 240px search band + a 480px tree + spacing + padding) exceeds that cap at ordinary viewport heights, so the **whole dialog scrolls while the tree also scrolls inside it**. Both scrollbars are visible in the screenshot. Nested scrolling of the same content is the reason the tree is cut off by the bottom of the screen. |
| **Does the dialog size itself, or is it sized by the shared surface?** | **Both, and the division is the finding.** The shared surface owns the **outer box** — the designed width, the 85vh cap, the scroll backstop, the glass, the scrim. That half is delivered work from `dialog_sizing`, it behaves as specified, and **it is not the defect**. The **interior distribution of that box is unowned**: the library offers a vertical stack that spaces children evenly and a two-pane primitive that takes a pixel height, and nothing that expresses *"these bands are chrome, this region takes the rest"*. Feature code filled the gap with pixel constants — which is also, on its own terms, a breach of the standing rule that no size is hard-coded outside the library. |
| **Is this defect one surface or many?** | **The voids: one surface.** Only the filesystem browser puts the search band in a column. **The unowned interior: all four large dialogs.** The image diff pins its split pane to 480px and its side-by-side viewer to 360px; the layer explorer pins an inner table to 320px and lets an uncapped table push the dialog past its cap; the efficiency view stacks uncapped tables the same way. None of them shows an interior void, but none of them uses the height it is given either, and all four state pixel heights in feature code. |
| **Did the delivered layout ever match the mockup?** | **There was never a target to match.** The relevant mockup, `.sdd/analysis/ui-mock/image_layers.png`, mocks the *screen* the dialog is opened from — the Images & layers list with its per-image layer stack — and contains **no filesystem browser dialog at all**. No mock of this surface exists anywhere in the set. What the mockup does establish, and what the delivered dialog contradicts, is the visual language: dense bands of ~32–40px rows, flush against their container, with no interior gap wider than the spacing between two bands. |
| **What else is in the body that the screenshot does not show?** | Two conditional bands that appear in real use and must be part of the layout's arithmetic: the **refused-entries note** (an entry that tried to escape the extracted tree) and the **truncated-matches note** (a search matching more entries than are listed). A height budget computed for the screenshot's four bands is wrong the first time either appears. |
| **What is the tree's own granularity?** | A row is **32px**, and the tree is virtualised **only when it is given a bounded height** — which is what the 480px constant currently buys. Whatever replaces that constant must still leave the tree a definite, measurable height, or the surface stops scrolling 522 entries cheaply. This is a constraint on the fix, not a reason to keep the constant. |
| **What does the right-hand pane do meanwhile?** | Nothing, at full height. The two-pane primitive stretches both sides to the same height, so the empty `No entry selected` placeholder is centred in a 480px column that is 760px wide — the single largest empty area on the surface after the two voids. Its width is fixed by the primitive's 320px leading pane; at narrow viewports the leading pane keeps its 320px and the detail pane is squeezed to whatever is left. |

**Conclusion: three separate causes produce one reported symptom.** A band that claims height it was
never meant to claim; a region that is pinned to a pixel height instead of taking the remaining space;
and a body that consequently overflows its own container and scrolls twice. All three are corrected
together or the report comes back.

## Summary

The filesystem browser dialog spends roughly 40% of a near-full-screen surface on two empty bands and
an idle detail column, and shows about a dozen of 522 entries in a tree pinned to a fixed height while
the dialog scrolls around it. The layout is restructured so that chrome takes only the height it
needs and the tree and its detail pane take everything else — with no capability, control, label or
wording changed.

## Business goal

**The surface exists to show a filesystem, and it is showing chrome.** The operator opened this dialog
to look at 522 entries. It occupies almost the entire screen and returns about a dozen of them, with
two thirds of its height spent on a title, three lines of chrome, two voids and an empty column. Every
row not shown is a scroll the operator pays for, on a feature whose whole promise is that inspecting an
image is faster here than at a terminal — where `docker create` + `docker cp` + `ls` fills the window
with entries and nothing else. A file browser that shows twelve entries per screen is losing to the
command it replaces.

**This is the product's differentiator, drawn badly, at its most scrutinised moment.** The reference
analysis stakes market position on a visual language against competitors that are functionally
adequate and visually utilitarian, and runtime-independent filesystem inspection is one of the
capabilities that competitors do not have at all. A dialog is judged in isolation: it interrupts, it
is the only thing on screen, and the operator looks straight at it. Two unexplained voids and a
double scrollbar do not read as a style choice — they read as an unfinished build, on precisely the
screen that is supposed to prove the opposite. The human's two lines are the correct reaction, and
they arrived unprompted from a screenshot.

**A layout that ignores the viewport is a defect that grows with the operator's monitor.** The tree is
480px whether the dialog is 600px tall or 1400px. So the better the operator's screen, the larger the
proportion of it this surface wastes — the exact inversion of what a desktop application is for.
Meanwhile at small heights the same constants overflow the dialog's own cap and produce nested
scrollbars, in which a keyboard selection or a search hit can scroll the wrong container and move the
tree out from under the operator. The layout is wrong at both ends of the range and right nowhere in
it.

**The cause is shared and silent, so fixing only the screen guarantees the defect returns.** The band
that claims 240px of height does so wherever it is placed in a column, without complaint, and the
library offers no way to say "this region takes the remaining height" — which is why feature code
reached for pixel constants in four different dialogs. Correcting the symptom on one screen leaves
both traps armed, in a codebase whose single-UI-library rule exists precisely to stop one visual
decision becoming four divergent ones.

## Requirements

### Functional — the interior layout

- **No interior void.** Between any two consecutive bands of the dialog's body there is exactly the
  surface's own band spacing and nothing more. Measured: no vertical gap inside the body exceeds
  twice the spacing used between the status row and the note on the same surface — and in absolute
  terms, no interior gap exceeds 32px at any viewport size.
- **Chrome is intrinsic, one region is elastic.** The bands that state things — the title, the
  status pill with `Re-extract…` and the `Download whole filesystem…` control, the scaffolding note,
  the refused-entries note when present, the search field with `Previous`/`Next`, the truncated-matches
  note when present — each occupy the height of their own content and no more. **The tree-and-detail
  region is the single region that absorbs all remaining height**, and it is the only one.
- **A control never claims height it does not use.** The search band occupies the height of the
  control it contains, in a column exactly as in a row. This must hold for the band wherever it is
  placed, not only on this surface: the corrected behaviour belongs to the shared control, so a
  future column use of it cannot reproduce the defect.
- **The dialog's body does not scroll as a whole.** At viewport heights of 600px and above there is
  exactly **one** scrollable region visible in this dialog's body — inside the tree — plus the detail
  pane's own when its content is long. The surface must not present a scrollbar around content that
  already has one. Below 600px of viewport height the shared dialog's existing scroll backstop may
  engage, and that is not a defect.
- **The card is still the size of its content.** `dialog_sizing`'s guarantee is not weakened by making
  a region elastic: when the content genuinely needs less height than the cap allows — an image with a
  handful of root entries, an empty filesystem, the brief loading state — the dialog is **as short as
  its content**, with no band of empty glass below it. The elastic region takes the *available* height
  only when it has something to do with it. A dialog that is always 85vh tall regardless of its
  content trades this defect for the one that was fixed two reports ago.
- **The layout holds in every state of this surface**, not only the screenshot's: while the kept
  result is being read (the loading indication bug-2 introduced), freshly extracted, from cache, with
  the refused-entries note present, with the truncated-matches note present, with an empty filesystem,
  with a file / directory / symlink selected, and with a long text or hex preview open in the detail
  pane. A height budget that only balances for the screenshot's four bands is not a fix.

### Functional — a stated, verifiable outcome

"Less wasted space" cannot be checked and would let this report be closed on a screenshot. The outcome
is therefore stated in measurements, at the viewport the automated suite already runs
(**1280 × 720**, the suite's own browser default):

- **At 1280 × 720, browsing an image whose root directory holds at least a dozen entries, the operator
  sees at least 10 entries without scrolling the tree**, against about 3 on the delivered build. If
  both conditional notes are present the floor is 8.
- **At 1280 × 720 the tree-and-detail region measures at least half of the dialog's inner height.**
- **The region grows with the viewport**: at 1280 × 1000 the region is measurably taller, and strictly
  more entries are visible, than at 1280 × 720. The delivered build shows the same 480px in both.
- These floors are derived from the delivered 32px row and the delivered 85vh cap. If either is
  deliberately changed later, the numbers are restated from the same reasoning — they are a way of
  making the outcome fail-able, not a design constant.

### Functional — the two panes

- **The tree and the detail pane stay side by side while there is room for both**, and **stack
  vertically below the library's existing narrow breakpoint**, tree first, with the tree keeping the
  larger share of the height. No new breakpoint is invented for this surface: the product has one set,
  and one visual language.
- **The idle detail pane does not present a full-height void.** With nothing selected, its placeholder
  states what it states today (`No entry selected` and its one-line explanation) **compactly and at the
  top of its column**, not centred in an empty column the height of the tree.
- **Selecting an entry does not move the tree.** The panes keep their positions and their widths
  whether or not an entry is selected: the row the operator just clicked must still be under the
  pointer afterwards. A layout that widens the tree while it is idle and re-narrows it on selection is
  refused for this reason.
- **The detail pane's content scrolls within the pane**, so that a long preview lengthens no dialog and
  moves no tree.

### Functional — nothing else changes

- **Every control on this surface survives, in place, with its label and its behaviour**: the title
  naming the image, the freshly-extracted / from-cache pill with its entry count, `Re-extract…`,
  `Download whole filesystem…`, the scaffolding note, the refused-entries note, the search field with
  `Previous` and `Next`, the truncated-matches note, the lazily-expanding tree with its search
  highlighting and keyboard navigation, the metadata list, `Text`/`Hex`, `Download`,
  `Download this folder…`.
- **No flow changes.** The two shapes bug-2 delivered — cost warning first when nothing is kept, tree
  directly when a result is kept — are untouched, as are bug-1's progress dialog, the cost warning's
  wording and everything the server does.
- **The tree's row and its density are unchanged.** This report is about how much height the region
  gets, not about fitting more rows into less of it. Making rows shorter would change the visual
  language to buy something the layout already owes.

### Non-functional

- **The correction lives in the UI library.** Both causes are library-side by nature: a shared
  control's sizing, and the absence of any way to express "chrome bands plus one filling region". The
  outcome must be that **feature code states no pixel height on this surface at all** — the pixel
  constants currently in it are themselves a breach of the standing rule, and they go with the fix
  rather than being replaced by smaller ones.
- **No raw markup, no CSS and no hard-coded spacing, size, radius or colour outside the library**, per
  the project's standing rule. A negative margin, a local stylesheet or an inline height on the
  feature screen is not an acceptable outcome of this report under any schedule pressure.
- **The blur allow-list is untouched.** This surface is not on it and does not join it; the dialog's
  own overlay glass keeps exactly the standing it has, the scrim keeps blurring nothing, and the
  automated conformance check needs no change.
- **`dialog_sizing`'s delivered behaviour survives, and is re-verified here**: the dialog's width
  remains a designed constant, the card remains the size of its content in both directions, and this
  is confirmed at narrow viewports as well as at desktop widths.
- **The tree stays fast with hundreds of entries.** Whatever gives the region its height must still
  leave the tree a bounded, measurable height so that its virtualised scrolling keeps working; 522
  entries with directories expanded must scroll without stutter, and nothing scroll-driven or animated
  is added to a surface drawn over the main view.
- **Keyboard and assistive-technology operation must not regress.** Reading and tab order stay as they
  are; the tree keeps its keyboard navigation; and a selection or a search hit that moves the
  highlighted row must scroll **the tree**, never the dialog — a failure only possible while the body
  is a second scroll container.
- **The three sibling large dialogs and the container logs view must be verified unaffected**, and the
  outcome stated explicitly rather than assumed: image diff, layer efficiency, layer explorer, and the
  one other user of the search band. They share the components being changed.
- **Verified against the real daemon** under the project's test discipline: own fixtures carrying the
  ownership labels, full cleanup in a `finally`, no assumption of an empty daemon or of inherited
  application state, its own data directory, no test reaching Docker Hub (the image used comes from
  the run's own registry), and every spec passing on its own.
- **English only**, per the project's convention.

### Non-functional — how this must be checked, explicitly and for the record

This project has already shipped a certified defect behind coverage that counted characters and clicked
programmatically (`CLAUDE.md`, *"What a check drives, and what it measures"*). This report is the same
class of defect — position and size, not presence — so the obligation is written here rather than left
to whoever writes the spec:

- **The check asserts geometry: measured viewport boxes.** The tree region's measured height against
  the dialog's measured inner height; the measured vertical distance between consecutive bands; the
  number of rows deduced from the region's measured height; the absence of a second scroll container
  around the body. Nothing in this report can be certified by reading text.
- **Content assertions are not a substitute and must not stand alone.** *"The tree is visible"*,
  *"13 entries are listed"* and *"522 entries is displayed"* are all **true of the screenshot in the
  bug report**. A check built on them passes on the delivered defect, and would repeat the earlier
  mistake exactly. They may stand beside the geometric assertions where they answer a different
  symptom, never instead of them.
- **Every interaction is driven with a real pointer at the visible control's coordinates** — the row's
  overflow control, the menu entry, the cost warning's buttons, a tree row, the search field, `Next` —
  never by calling an element's `click()`, never by dispatching events, and never by aiming at a
  visually hidden element.
- **The check must fail on the delivered build.** Whoever writes it states the measurement it produces
  before the fix and after it; a check that passes on both certifies nothing. The delivered build's own
  numbers are on record here: ~110px voids, a 480px region at every viewport, two scrollbars, ~3 rows
  visible at 1280 × 720.
- **The fixture is an image with enough root entries to make the count meaningful** — the mirrored
  `alpine:3.20` already used by this suite has thirteen — and the check establishes its own extracted
  state rather than inheriting one.

## What the operator must observe, in order

1. On the images list, the operator opens the row's overflow menu and chooses `Browse filesystem…`;
   the flow bug-2 delivered is unchanged — the cost warning first, or the tree directly when a result
   is kept.
2. The filesystem dialog is on screen. Below the title, the status pill with `Re-extract…`, the
   `Download whole filesystem…` control, the scaffolding note and the search field sit as **four
   compact bands, one spacing step apart**. There is no empty band anywhere between them.
3. **The tree begins immediately under the search field and continues to the bottom of the dialog.**
   At 1280 × 720 at least ten entries are visible without scrolling it; on a taller screen, more.
4. The dialog itself does not scroll: the only scrollbar in the body is the tree's own.
5. Nothing is selected, so the right-hand pane states `No entry selected` and its one line, compactly,
   at the top of its column — not centred in an empty column.
6. Selecting an entry fills that pane with the metadata, the preview and the download controls. The
   tree does not move, does not change width, and the row just clicked is still under the pointer. A
   long preview scrolls inside the pane.
7. Typing in the search field and pressing `Next` reveals and highlights a match inside the tree; the
   tree scrolls, the dialog does not.
8. At a narrow viewport the two panes stack — tree first, detail below — and every control is still
   reachable, still labelled the same, still doing the same thing.
9. Browsing an image whose filesystem holds only a handful of root entries opens a **short** dialog
   sized to its content, with no band of empty glass below the tree.

## Assumptions

Every gap the report leaves is closed here with a default and its reason. None is returned as a
question: the human's instruction is deliberately open, the detail is delegated, and none of these is
a scope change, a destructive action or a contradiction.

- **This is a fix, not an evolution.** The delivered surface has a layout that distributes its height
  by accident; the cause is identified, the corrected behaviour is stateable and measurable, and no
  capability is added or removed.
- **"Fix and enhance the layout" is licence to restructure, not to redesign.** No control is added,
  removed, renamed or reworded; no operation changes; the flow bug-2 delivered is untouched. What
  changes is where space goes. Anything beyond that is a different request, and the human is away.
- **The dialog's outer box is not reopened.** The designed width and the 85vh cap are delivered,
  certified work from `dialog_sizing`, applying to every dialog in the product. Changing them inside a
  report about one dialog's interior would put an unattributable change to eleven other surfaces
  inside this fix.
- **A full-screen dialog was considered and rejected.** It would answer the report — a filesystem
  browser is exactly the "series of tasks" case for which the category sanctions a full-screen dialog
  — but it contradicts a decision taken two reports ago for the whole product, and it is unnecessary:
  once the interior stops spending 240px on a search band and pinning the tree to 480px, the existing
  box holds three to four times the entries it shows today.
- **The tree keeps the whole remaining height, and the chrome is not moved into the detail pane.** One
  attractive alternative was to move the scaffolding note into the idle detail column, buying back a
  band of height. It is rejected: that note is a truthfulness caveat about what the listing contains,
  and making it vanish the moment an entry is selected changes what the operator can learn — which
  this fix is not licensed to do.
- **The idle detail pane keeps its place and its width.** The alternative — giving the tree the whole
  width until something is selected — was rejected because it moves the surface under the operator's
  pointer at the instant they click a row. This project has already paid for one shipped defect in
  which a surface moved during an interaction, and the coverage written for it passed.
- **The narrow-width behaviour reuses the library's existing breakpoint** rather than inventing one for
  this dialog, because the product has one visual language and one set of breakpoints. Stacking, rather
  than shrinking the tree pane, follows the settled treatment of two-pane layouts in narrow contexts.
- **The 240px in the search band is not "tuned down".** The value is not the defect; the band claiming
  height in a column is. A smaller constant would leave a smaller void and the same trap for the next
  surface.
- **Row height and tree density are unchanged.** The region owes the tree three times the height it has
  today; taking that out of the row instead would change the mocked visual language to buy back space
  the layout already owes.
- **The mockup set does not decide this surface, because it does not contain it.** The relevant
  mockup mocks the screen behind the dialog. So the delivered layout never diverged from a target —
  there was none — and the standard applied here is the visual language the mocked screens do
  establish: dense bands, no interior gap wider than the spacing between two of them.
- **The sibling large dialogs are recorded and not re-laid-out here** (see Scope). They do not exhibit
  the reported symptom; they share the *unowned interior*, and they will inherit the library's new
  ability to express it when each is taken deliberately.
- **The container logs view is expected to be unaffected and is verified, not assumed.** It is the only
  other user of the search band, and it uses it on the axis the band was written for.
- **The screenshot's build reached this view through the screen bug-2 removed.** Nothing in the
  analysis above depends on that screen; the extracted view in the screenshot is what the current code
  renders, and every measurement quoted was re-established against the current code.

## Constraints

- **Product constraint — every visual element comes from the UI library.** The library is the only
  place in the client permitted to emit raw markup or contain styling, and no spacing, size, radius,
  colour or z-index may be hard-coded outside it. This report is exactly where that rule bites: the
  correction has one legitimate home, and the pixel heights currently in feature code are part of what
  is being corrected.
- **Product constraint — the library grows before the feature consumes it.** If expressing "chrome
  bands plus one filling region" needs something the library does not have, the library gains it
  first, generic and domain-agnostic, and the feature composes it afterwards. An existing primitive
  that almost fits is extended rather than duplicated.
- **Product constraint — the main view pays nothing for the glass.** No surface joins the blur
  allow-list, no blur value is written on the spot, and the conformance check that enforces both
  halves must need no change.
- **Product constraint — the card is the size of its content, and a dialog's width is a designed
  constant.** `dialog_sizing`, delivered. Making a region elastic must not reintroduce a card that
  disagrees with its content, at any viewport.
- **Product constraint — the flow into this surface is bug-2's, and the progress dialog is bug-1's.**
  Both are delivered and certified; neither may be disturbed by a layout change, and the loading
  indication bug-2 introduced is one of the states this layout must hold in.
- **Product constraint — nothing on the daemon side changes.** No new Docker operation, no change to
  extraction, caching, cancellation or download.
- **Repository constraint — the suite runs against the operator's own daemon**, so verification obeys
  the fixture rules: ownership labels, full cleanup, `docker rm -fv`, its own data directory, no
  reliance on an empty daemon, no reach to Docker Hub, and every spec passing on its own.
- **Verification constraint — the assertion must be able to fail on the delivered build**, and it must
  be geometric and pointer-driven, for the reasons recorded above.
- **Convention constraint — English only**, and kebab-case for any new file or folder name.

## Market trends

Relevant and consulted, narrowly. This is a product with named competitors, and the two open questions
— whether a dialog should hand its spare height to its content, and what a two-pane layout does when it
runs out of width — are settled in published practice. The findings support the fix and, more usefully,
mark where it must stop.

- **Space is to be spent, not hoarded, and a viewer should show what the user came to see without
  scrolling.** NN/g is direct about it: *"Screen space shouldn't be hoarded, it should be spent"*, and
  *"show stuff in a space that's big enough to let users see everything they need to see without
  scrolling"*, warning specifically against confining content to a *"tiny peephole"*. A 480px tree in a
  near-full-screen dialog is that peephole, and the operator's complaint is the same one, arrived at
  independently.
  ([NN/g — Utilize Available Screen Space](https://www.nngroup.com/articles/utilize-available-screen-space/))
- **Empty space that carries nothing is measured waste, not restraint.** NN/g's homepage real-estate
  study found *52% of screen space completely wasted* on filler and blank areas, and that users spend
  most of their attention on the first screenful — which on this surface is entirely chrome and voids.
  Higher information density means *"less need to move around and a higher likelihood that users see
  what they want"*, with the standing caveat that density is not cramming, which is why this fix takes
  the space back from voids rather than from row height.
  ([NN/g — Homepage Real Estate Allocation](https://www.nngroup.com/articles/homepage-real-estate-allocation/);
  [NN/g — Information Density](https://www.nngroup.com/topic/information-density/))
- **A dialog reaches a maximum size and then scrolls its content; a task-shaped dialog is allowed the
  whole screen.** Material's guidance caps an ordinary dialog and lets its content scroll on reaching
  that cap, while treating full-screen dialogs as the form for *"a series of tasks"*. Both halves are
  useful here: the 85vh cap is the industry-normal backstop and stays, and the full-screen option is
  real but is deliberately declined above, because the product settled its dialog box two reports ago
  and the interior has three to four times the room it currently uses.
  ([Material Design 3 — Dialogs specs](https://m3.material.io/components/dialogs/specs);
  [Material Design 2 — Dialogs](https://m2.material.io/design/components/dialogs.html))
- **A two-pane master–detail layout needs horizontal room, and collapses to a single column when it
  does not have it.** Apple's guidance is that split views belong in *regular*, not compact, width
  environments and that multi-column layouts collapse to one column when width is compact. That is the
  published basis for stacking the tree and the detail pane at the narrow breakpoint rather than
  squeezing a 320px tree against a 60px detail column — the delivered behaviour today.
  ([Apple HIG — Split views](https://developer.apple.com/design/human-interface-guidelines/split-views))
- **What the category expects of a file browser.** Docker Desktop's own *Files* view presents a
  filesystem as a full-height tree filling its pane, entered and browsed rather than framed by chrome.
  The product's dialog is legitimately different in kind — it browses an *image*, which no competitor
  does — but the expectation it is judged against is the same: the tree is the surface.
  ([Docker Docs — Explore the Images view in Docker Desktop](https://docs.docker.com/desktop/use-desktop/images/))

## Risks

- **The voids are closed with smaller numbers.** The likeliest wrong fix: tune the band down, drop the
  tree to a different pixel constant, ship. The screenshot looks better, nothing became elastic, the
  tree is still the same height on a 27-inch monitor as on a laptop, and the next surface to use the
  search band in a column reproduces the void exactly.
- **A negative margin, or a stylesheet in feature code.** The fastest route to a passing screenshot and
  a direct breach of the project's central rule — a layout bug hidden by compensating for it on the
  screen that shows it, in the one place styling may not live.
- **The check certifies the wrong thing.** The delivered build already renders a visible tree listing
  thirteen entries with a `522 entries` caption. Any check asserting presence, text or counts passes
  on the defect. This is not hypothetical here: this project shipped a defect behind exactly that
  weaker form, twice.
- **The dialog becomes permanently 85vh tall.** The natural over-correction of "one region absorbs the
  remaining height": an image with four root entries then opens a screen-high card mostly full of
  nothing, which is `dialog_sizing`'s defect reintroduced from the other direction, on the report right
  after it.
- **The second scrollbar survives.** If the body remains a scroll container, the surface looks fixed at
  one viewport and is broken at 720px — and keyboard selection or a search hit can scroll the dialog
  instead of the tree, moving the tree under the operator mid-interaction.
- **The conditional bands are forgotten.** A height budget balanced against the screenshot's four bands
  goes wrong the first time an image has a refused entry or a search truncates — states no screenshot
  in this report contains.
- **The container logs view regresses.** The search band is shared, and it is currently correct there.
  A change made for a column that alters its behaviour in a row moves the defect to a screen nobody was
  looking at.
- **Narrow width is left as it is.** Height is what the screenshot shows, so a fix aimed only at height
  leaves the fixed 320px leading pane crushing the detail pane below ~700px — a functional failure
  (controls that cannot be read) rather than a cosmetic one.
- **The tree loses its virtualisation.** It is virtualised only while it has a bounded height. A fix
  that makes the region "grow to fit" instead of "fill and scroll" quietly renders every visible row of
  a 522-entry tree, on a surface whose whole point is large images.
- **All four large dialogs are re-laid-out at once.** Tempting, since they share the unowned interior —
  and it would make any regression on any of them unattributable to the report that asked for it. The
  precedent is bug-2, which recorded its sibling and deliberately left it.
- **The report is closed on a screenshot.** "It looks better" is how this defect was found and is not
  how it is certified. Without the stated measurements, at the stated viewports, failing on the
  delivered build, the surface can regress silently the next time a band is added to it.

## Scope

**In scope**

- The interior layout of the image filesystem browser dialog: the bands of chrome, the elastic
  tree-and-detail region, and the elimination of both empty bands.
- The shared search band's behaviour in a vertical container, corrected where it lives so no future
  column use reproduces the defect.
- Whatever the UI library needs in order to express "these bands are chrome, this region takes the
  remaining height" — added to the library, generic and domain-agnostic, before the feature composes
  it — so that this surface states no pixel height in feature code.
- The two panes: side by side while there is room, stacked at the library's existing narrow breakpoint,
  the idle detail placeholder made compact and top-aligned, and no movement of the tree when a
  selection is made.
- Scrolling: one scroll region for the tree, one for the detail pane's own content, and no scrollbar
  around the body at viewport heights of 600px and above.
- The stated measurable outcomes at 1280 × 720 and 1280 × 1000, checked geometrically, driven with a
  real pointer, and demonstrated to fail on the delivered build.
- Confirmation — stated explicitly, not assumed — that the image diff, layer efficiency and layer
  explorer dialogs and the container logs view are unaffected by the shared changes, and that
  `dialog_sizing`'s card-fits-content guarantee still holds at desktop and narrow viewports.

**Out of scope**

- Any change to what this surface offers or says: no control added, removed, renamed or reworded; no
  change to extraction, caching, cancellation, search, preview or download behaviour; nothing on the
  daemon side.
- The flow into the surface (bug-2, delivered) and the progress dialog inside it (bug-1, delivered).
- The dialog's outer box — its designed width, its 85vh cap, its glass, its scrim and its place on the
  blur allow-list — and the conformance check that enforces the allow-list.
- Re-laying-out the sibling large dialogs (image diff, layer efficiency, layer explorer). They share
  the unowned-interior cause, they show no interior void, and they are named here so each can be
  requested deliberately rather than rediscovered — after which they inherit the library's new
  primitive.
- The tree's row height, its glyphs, its typography and the surface's visual treatment: this report
  moves space, it does not restyle.
- The images list, the row overflow menu, its entries, their order and their labels.
- The other reports in `bugs.md` — bug-4 and bug-5 — each taken separately in its own analysis.
