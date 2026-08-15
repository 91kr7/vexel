---
slug: ui-coherence-optimisation
date: 2026-08-14
spec: .sdd/analysis/ui-coherence-optimisation.md
requirements: .sdd/plans/plan-ui-coherence-optimisation/requirements.md
status: validated
---

# Batches — UI coherence and usability

**Nineteen batches**, in four movements: the four blocking repairs, one declared foundation batch,
eight screen migrations, then six screens whose defects are their own. Batch numbers and
`REQ-n`/`INT-n` ids are local to this plan.

**One batch is one screen, and that is the dogma applied rather than a stylistic choice.** The
analysis's governing observation is that restyling screens one at a time produces thirteen new
answers — so the *rules* are decided once, in batch 5, and every batch after it is a screen adopting
them and **deleting** what it had. A batch that migrated a layer across screens (all the lists, then
all the panels) would leave every screen half-migrated and close no requirement: F6 to F19 are each
stated over one screen's observable behaviour.

## Corrections to the analysis, checked against the source

Two of the analysis's premises are wrong, and both were checked against `client/src` and
`.sdd/modules/` while writing this plan. **Its observations are right — every defect it reports is
real and its measurements stand.** What is wrong is the *cause* it assigns to them, and the cause is
what a plan is built on.

**1. The nine screens do not hand-build their lists.** The analysis says they "each hand-build a list
out of raw surfaces". They do not: they consume a library component, **`CardList`**, at **seventeen
call sites across eleven files** — `VolumesPanel:209`, `NetworksPanel:265`, `RegistriesScreen:229`
and `:261`, `BuildersScreen:229` and `:249`, `PluginsScreen:223` and `:245`, `ContextsScreen:161`,
`SwarmNodesPanel:137`, `SwarmSecretsPanel:130`, `SwarmServicesPanel:261`, `SwarmConfigsStacksPanel`
(configs and stacks), and **`LayerEfficiencyView:175`, `:193`, `:215`** — plus `GroupedRowsPanel` at
`ComposeScreen:208`. **The enumeration governs, never the figure**: this plan first said "eighteen",
inferred over a truncated search rather than counted, and it was corrected at the coverage gate
against the source. The per-batch budget decrements below are the enumeration and they sum to
seventeen (2 + 2 + 2 + 1 + 2 + 0 + 5 in batches 6 to 12, and 3 in batch 13); a checklist copied from
a total rather than from the list is how a call site survives a removal, which is the mistake a
sibling plan on this branch already paid for. This matters three ways:

- **The migration is a call-site migration, not a rewrite.** Each screen swaps one library list for
  another and deletes its row-content builders; it does not grow markup it never had.
- **`CardList` must be removed, or the incoherence survives the whole programme.** A second list
  component left exported is the next screen's fifth answer (REQ-82). It is deleted in **batch 13**,
  the last batch holding a call site.
- **`LayerEfficiencyView` is a call site on a `DataTable` screen** — three of the seventeen. A
  programme that migrates "the nine screens" and stops leaves `CardList` alive on images. It is in
  batch 13 for that reason, and it is the single most likely thing to be forgotten.

**2. The missing layer is not missing components — it is missing rules.** The analysis lists five
primitives to "add". Four of the five **already exist and are widely adopted**:
`SectionHeader`, `EmptyState`, `DetailPanel`, `ActionButtonGroup`/`Menu`/`ScreenToolbar` — 183
occurrences across 37 files. What does not exist is a *rule* about which to use, so `Card`'s eyebrow
title competes with `SectionHeader`, `EmptyState` is used on some empty results and not others, and
three list components ship with nothing to choose between them. **Batch 5 is therefore consolidation,
not construction**: mostly `modify`, one absorption, one retirement. It is still a foundation batch —
it changes nothing on screen — but it is much smaller than "add five primitives" suggests, and an
implementer who reads the analysis literally will build four near-duplicates of components that are
already there. That is the specific accident this section exists to prevent.

Both corrections are **for the analysis to absorb**, on the precedent of commit `5f5aa2e`: the
requirements were written to survive them (REQ-22 already said *extend `DataTable`*, REQ-26 *one
treatment*, REQ-81 *one answer each*), so nothing here is a departure — but the analysis's section 1
and section 7.2 should be corrected in place before an implementer reads them as a build list.

## The batches

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · nav-rail-reachable | F1 — every navigation destination is reachable at every viewport | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5 | — | certified | **Resize the window to 1280×800 — the most common laptop size there is — and click `About` in the rail with the mouse.** On the delivered build nothing happens: the click lands on the footer card painted over it. It must now navigate. Then `Raw console`, then `System & prune`, the other two that are unreachable today. Then **stretch the window tall, to 1440×1000**, and confirm the opposite symptom is gone too: no large dead gap between the last entry and the active-context card. Then **shrink it to 375×667** and open the phone drawer: every entry scrollable to and clickable, the drawer's card still blurred exactly as before — it is on the blur allow-list and this batch must not touch that. The list scrolls; the footer card never sits on top of it and is never sat on. |
| 2 · list-row-columns | F2 — a list row keeps its content below the desktop breakpoint | REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11 | — | certified | **Open Containers at 375×812.** Today you see a status dot and four buttons: the name, image, CPU, memory, ports and uptime are all in the DOM at zero width. You must now be able to **read the container's name**, and to **drag a horizontal scrollbar** and reach every other column — the scrollbar being the half that is missing today, because the row clips its own overflow and the scroll area concludes there is nothing to scroll. Check the same on Images. **Then check nothing moved above the breakpoint**: at 1440×1000 and 1280×800 the containers and images tables are pixel-identical to the delivered build — same columns, same widths, same row height, same expansion. This is a repair below the breakpoint, not a redesign above it. |
| 3 · header-truthful | F3 — the header offers only working controls, and no second route | REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-93 | 1 | certified | **Look at the header: the `⌘K Search` control is gone, and so is `Console`.** Press `⌘K` — nothing, as before, but nothing is now advertised either. Click every remaining header control on two different screens with the mouse and confirm each one does something. The raw console is still reachable, from the rail, which is where destinations live. **Then the half a screenshot cannot show**: `client/src/ui/controls/KeyHint.tsx` does not exist and neither does its line in `client/src/ui/index.ts` — it had exactly one consumer, the badge, and a component left in the library unused is the product still shipping what was removed, in the one place it cannot be seen. `grep` for `KeyHint`, `⌘K` and the header console action across `client/src`, `client/test` and `client/e2e`: nothing. The header's remaining controls keep their delivered order, spacing and height. |
| 4 · truncation-contract | F4 — a long identifier never collides with the value beside it | REQ-17, REQ-18, REQ-19, REQ-20, REQ-21 | — | certified | **Volumes & networks**: the volume's mount path no longer runs under its size — the reading `…c758d3…0B_2b` is the delivered defect and it must be gone, the path ellipsised and the size intact and legible. **System & prune**: the `Unused volumes` hash runs under both the size and the `Prune` button today; the button must be whole and clickable. **Contexts**: the endpoint `unix:///Users/…/.docker/run/docker.sock` no longer runs under the `active` pill. All three at 1440×1000, 1280×800 and 375×812. **Then the thing not to have bought with it**: open a detail panel and confirm a property value still **wraps** and is still wholly readable — a one-line clamp there would turn a layout defect into a data loss, on exactly the values the operator has to read exactly. |
| 5 · library-layer | F5 — the library gains the missing layer (**declared foundation batch**) | REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-94 | 2, 4 | certified | **There is almost nothing to look at, and that is the acceptance.** Open all thirteen screens at all three viewports and confirm **every one of them is identical to the delivered build except its empty states** — nothing else consumes the new work yet, and a screen that moved otherwise means it leaked into the feature layer. **The one exception, measured and listed in the batch file**: `EmptyState` now draws on a surface of its own, as REQ-25 requires, and being one component with 49 call sites that lands everywhere at once — **height +2px, title +1px y, width unchanged**, at all ten on-screen sites at all three viewports, with **0 surfaces moved and 0 structural differences at 1440×1000 and 1280×800**. **Two exceptions to the width half, measured at 375×812**: `ComposeScreen.tsx:222` (`48×165.56 → 50×167.56`) and `:237` (`48×142.38 → 50×144.38`), `x` unchanged — they sit in the `1fr` column of a fixed `Grid columns="2fr 1fr"` and resolve **shrink-to-fit**, where `box-sizing: border-box` has no specified width to absorb the hairline into. Those boxes are 48px wide — `2 × --space-6`, i.e. padding around zero content, the title wrapping one character per line — so the 2px is a rounding error on a container that is already broken in the delivered build; the container is pinned to batch 11, not chased here. The single `compact` site (the filesystem browser's detail pane) additionally +10px height and +17px title x, and +28.85px height at 375×812 — **reconstructed from source rather than observed**, its state being unreachable in a screen sweep. It is deliberately landed **here**, where nothing else moves, so that any regression has one candidate cause and can be reverted on its own; landing it in batch 6 would have put it inside the batch that also rebuilds volumes and networks. **Raw console is the one screen with no empty state at all** and must be pixel-identical. Then read `client/src/ui/index.ts`: the object list offers a **comfortable** variant beside its dense one, carrying what `CardList` carries today (title, monospace subtitle, badge group, meta values, leading dot, active-selection row, expansion slot), so the eight migrations that follow lose nothing. Read the five components and find **no Docker word in any of them**. Run `npm run test -w client` and see each variant and state covered. Note that **`CardList` is still there** — it has seventeen live call sites and it goes in batch 13, not here — and that this batch seeds the budget check that catches an eighteenth being added while it lingers. |
| 6 · volumes-networks | F6 — volumes and networks listed and revealed like every other object | REQ-31, REQ-32, REQ-33, REQ-34, REQ-35 | 5 | certified | **Open a volume's detail.** Today it expands *inside the narrow card column*, one property per line, hashes wrapping mid-string, and the `RAW PAYLOAD` block rendered into about 250px where it cannot be read. It must now open **full width**, in the two-column grid, with the payload readable. **Then open a network's detail while the volume's is open**: the volume's must close — two parallel long scrolls on one screen is the delivered behaviour and it ends here. Check the network `Options` value is **left-aligned** like every other value in the product. Then exercise every action: create, remove, prune, and `+ Attach` on a network — which must now look like a control, because it is one — and confirm each still does exactly what it did. |
| 7 · registries | F7 — registries | REQ-36, REQ-37, REQ-38 | 5 | certified | **Look down the column of registries and confirm the rows are the same height.** Today `authenticated · credential store: desktop` wraps to two lines while `not authenticated` occupies one, so heights alternate all the way down. Then `Log in` and `Log out` on a row: same behaviour as delivered, now as row actions rather than one-off trailing buttons. **Then the empty state, which is the one the analysis calls correct**: `Search Docker Hub` with its explanatory line, the same words, now expressed as title + one line + the action that resolves it. Search a repository and pull a tag: unchanged. |
| 8 · builders-build-cache | F8 — builders and build cache | REQ-39, REQ-40, REQ-41 | 5 | todo | **Read one builder row.** Today its name is printed as the row title **and again as a third line**; one of them is gone and nothing else has left with it. The mixed line `running · cache 14.6MB · in use · Remove` — a pill, a plain string, a status and a button, all in one undifferentiated run — now reads as a status column and an action cluster, so you can tell by looking which of them you can click. The screen's page-level actions sit in the toolbar under the header, not in a card header. Create a builder, switch the active one, remove one, prune the cache: each still does exactly what it did. |
| 9 · contexts | F9 — contexts | REQ-42, REQ-43, REQ-44, REQ-45 | 5 | todo | **`use` is a control now.** It is the bare text that switches your active Docker context — the most consequential click on the screen — and it looked like a word. Click it and confirm the switch happens exactly as before, every cached view dropping the previous daemon's data. The endpoint no longer collides with the `active` pill. **Then scroll down: the eight-property daemon block is gone from this screen** — it lives on System & prune, because it describes the daemon and not the context, and it does not change as you look down this list. If the active context's row now carries a two- or three-property summary, that is intended and is not the duplication returning. Create a context, remove one: unchanged. |
| 10 · plugins | F10 — plugins | REQ-46, REQ-47, REQ-48 | 5 | todo | **Put a ruler down the `enabled` pills.** Today the pill is positioned relative to the version string, so a row with `v0.36.0-desktop.1` pushes its pill left of its neighbours' and the column reads ragged; every pill's left edge must now be identical. **Then `No daemon plugins`** — bare text floating in the layout today — is a real empty state on a surface, with a title, one line of explanation and, where there is one, the action that resolves it. Install after a privilege grant, enable, disable, inspect, remove: each unchanged, and the install still refuses unless exactly the privileges asked for are granted. |
| 11 · compose | F11 — compose | REQ-49, REQ-50, REQ-51 | 5 | todo | **The screen with no list gets the one every other screen uses.** Each project is a row with its actions; opening one reveals its detail full width, in the two-column grid. `No compose projects` becomes a real empty state on a surface instead of bare text. **Then check what must not have been lost in the swap**: the per-service state of every service in a project, the up/down/restart and scaling actions, the compose file editor with its validation and its confirmed save, and the aggregated log stream — including the case the log stream is offered with no download filename, which is Compose with no project selected and is where a certified predecessor's empty action row was fixed. |
| 12 · swarm | F12 — swarm | REQ-52, REQ-53, REQ-54, REQ-55, REQ-56 | 5 | todo | **Open Swarm on a daemon that is not a swarm.** Today it tells you so **five times**: a banner, then the identical paragraph in four cards. It must now say it **once**, on one surface, with `Initialise a swarm` and `Join an existing one` sitting **with the statement** rather than in a banner above four repetitions of it. Both actions still do exactly what they do. **Then the alignment**: `Configs & stacks` carries a `CONFIGS` sublabel that `Secrets` does not, and the two cards start at different heights; they must now share a baseline. On a swarm manager, nodes, services, stacks, secrets and configs use the one list and the one panel — and the join tokens are still masked, still revealed by `Show`, still rotatable. Nothing here initialises a swarm on your daemon; what cannot be exercised says so. |
| 13 · images-layers | F13 — images and layers: one fact, one place; two sizes, two names | REQ-57, REQ-58, REQ-59, REQ-60, REQ-61, REQ-82, REQ-94 | 5, 6, 7, 8, 9, 10, 11, 12 | todo | **Read one image row: `alpine:3.20` is printed once, not twice** — the `TAGS` pill repeating the `REPOSITORY:TAG` column on every row is gone, and an image with several tags still shows all of them. Open the panel: `Id` and `Digest` no longer show the identical value, and the `Labels` section with a count of `0` is **absent**, not present and empty. **Then the contradiction that is the point of the batch**: the row said `13.0MB` and the panel said `3.9MB`, both under the word `Size`. Each number now carries a label saying what it measures, and the two labels differ. **Then the thing that closes the whole migration**: open the layer efficiency view — its three lists were the last `CardList` call sites — and confirm `client/src/ui/data/CardList.tsx` **does not exist**, nor its export, nor its spec. `grep CardList` across `client/` returns nothing. Bug-4's column counts are identical at the same measured section width and no copy control has returned. |
| 14 · system-prune | F17 — system and prune | REQ-73, REQ-74, REQ-75 | 5 | todo | **The screen keeps the eight daemon properties** — it is the one that gained them under batch 9's decision — with the same words and the same values. **Then what must not have moved**: every prune row still prunes exactly what it pruned, still distinguishes actionable from inert, still confirms with the shared-daemon warning and still reports the space reclaimed; the destructive tint is unchanged; and the **callout is untouched** — it is one style used twice, correctly, and it is not to be restyled, replaced by an empty state or absorbed into a section header. The `Unused volumes` row still reads cleanly, batch 4 having repaired it. |
| 15 · about | F16 — About | REQ-70, REQ-71, REQ-72 | 5 | todo | **Three section-header treatments on one screen become one.** `IDENTITY AND LICENSE` (uppercase, outside a card), `CLI availability` (sentence case, inside a card) and `DAEMON EVENT STREAM` (uppercase, inside a card) now read as the same kind of thing. **Then the event stream is gone from About** — it repeated the Dashboard's verbatim, and About is an identity and licence screen. Confirm the Dashboard's stream still runs, still connects and still shows the same events. **Then confirm nothing of the notice moved**: product name, copyright, licence with a route to each of its two documents, absence of warranty, right to convey, repository with the running version, network-modification duty, reservation of the name — the certified `about_license_notice` plan's whole subject, word for word. |
| 16 · raw-console | F18 — raw console | REQ-76, REQ-77 | 5 | todo | **Run an API-channel command and read the payload.** Today it is an unwrapped wall of JSON breaking mid-token; it must now wrap without breaking a token, stay inside its surface at all three viewports, and remain real, complete, selectable text — select a value out of it with the mouse to prove it. Then the transcript: every entry keeps `Re-run` and its status badges with their delivered spacing, the history recalls as before, the destructive confirmation still intervenes, and **no copy affordance has returned** to any entry. |
| 17 · containers-detail | F14 — containers: the expanded detail stops fighting for room | REQ-62, REQ-63, REQ-64, REQ-65 | 5 | todo | **Expand a container row and open `Logs`.** The heaviest toolbar in the product sits in there as three stacked rows, one of which holds `Download` alone. It must occupy fewer rows and **no row may hold a single button**, with every control — stdout/stderr, timestamps, line count, since, until, the filter and its previous/next — still doing exactly what it did; download a log and confirm the file still holds the whole buffer. **Then `Stats`**: five metrics in a four-column grid leave `PIDS` orphaned on a second row; that must be gone, and the tiles must be uniform — a tile without a bar must not look like a tile whose bar failed. Then `Config`, `Processes`, `Inspect`, `Exec` and `Attach`, all unchanged, the empty `Labels` section absent, and bug-1's progress dialog and bug-4's column rule undisturbed. |
| 18 · dashboard | F15 — dashboard | REQ-66, REQ-67, REQ-68, REQ-69 | 5 | todo | **`Container activity` and `Disk usage` end at the same y.** The ragged bottom edge of the middle row is the delivered symptom; measure both cards at 1440×1000 and 1280×800. **Then the disk-usage chart**: its two hues carry a legend naming what each means, and a row whose value is `0B` renders something that reads as zero rather than nothing at all — today you cannot tell "zero" from "not measured". Then click through from a tile and from an activity row to the screen owning that object: the cross-navigation still lands and still reveals the object. |
| 19 · dialogs | F19 — dialogs, and the programme's closing invariants | REQ-78, REQ-79, REQ-80, REQ-81, REQ-83, REQ-84, REQ-85, REQ-86, REQ-87, REQ-88, REQ-89, REQ-90, REQ-91, REQ-92 | 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18 | todo | **Open the container create/run form at 1280×800.** Today every field group is its own nested sub-card — boxes inside boxes down a long scroll; it must be measurably shorter and read as one form. `IMAGE`, `ENTRYPOINT`, `COMMAND` use the one label treatment rather than a fourth header style, each field keeping its label, its association with its input and its validation. `Add variable` and `Add port mapping` are controls that look like controls. **Then operate the privileged toggle with a real mouse click at its own coordinates** and confirm the dialog's viewport box is unchanged — that defect shipped once and cost two builds to find. **Then the programme's closing check**: walk all thirteen screens and count the answers — one way a list is drawn, one way detail opens, one place actions live, one empty state, one section header. `npm run lint` and `npm run test -w client` green, `check-ui-conformance.mjs` **unmodified** and passing, `blurAllowedOverlaySelectors` unchanged, and no raw tag, `style` or CSS anywhere outside `client/src/ui/`. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the orchestrators
of the later phases. On green tests a batch goes to `certified`.

Batch files: [`batches/`](batches/) — one per row, named `batch-<n>-<slug>.md`.

## Order and dependencies

```
1 nav-rail   2 columns   3 header   4 truncation      (independent of each other, any order)
                 └────────────┴──► 5 library-layer (foundation)
                                      ├─► 6 volumes-networks
                                      ├─► 7 registries
                                      ├─► 8 builders-build-cache
                                      ├─► 9 contexts
                                      ├─► 10 plugins
                                      ├─► 11 compose
                                      ├─► 12 swarm
                                      ├─► 13 images-layers   (after 6–12: deletes CardList)
                                      ├─► 14 system-prune  ├─► 15 about  ├─► 16 raw-console
                                      ├─► 17 containers-detail  ├─► 18 dashboard
                                      └─► 19 dialogs         (last: closes the invariants)
```

- **Batches 1 to 4 ship first and ship alone.** They are the blocking repairs; two of them are
  one-file changes; none of them needs the library layer, and the operator gets three unreachable
  screens and a readable list back without waiting for a fifteen-batch programme.
- **2 and 4 precede 5** rather than sitting beside it: batch 5 extends `DataTable` and generalises the
  truncation contract, so both must already be right or the primitive inherits the defect and every
  migrated screen inherits it from the primitive.
- **13 depends on 6 to 12** for one reason only: it deletes `CardList`, which cannot go while any call
  site remains. Its own content depends on nothing but 5.
- **14 to 18 are independent of each other** and of 6 to 13; they can run in any order, or in parallel
  with the migrations if that suits.
- **Batches 14 to 19 are where the graphical half of the request lives**, and they are kept for that
  reason: a programme that repaired the defects and unified the plumbing without the screens looking
  better would have delivered the invisible half of what was asked. That they detach cleanly — no
  batch upstream depends on any of them, and 19's invariants would move to whichever batch became the
  last — is a **stated fallback if priorities change**, not a recommendation to take it.
- **19 is last** because it closes the cross-screen invariants (REQ-81, REQ-92), which are false until
  the final screen adopts them.

## Assumptions and decisions

- **The five gate decisions govern** and are recorded with their reasoning in `requirements.md`: the
  `⌘K` control is removed rather than built into a palette (a palette is a **recommended follow-up
  report**, not deferred scope of this plan); the header `Console` button goes and the rail is the
  single route; bulk selection is out of scope and knowingly left standing, with both directions
  named for whoever picks it up; section 5's density work is kept, as trailing batches; System &
  prune keeps the daemon properties and the Dashboard keeps the event stream.
- **`CardList` is absorbed, not merely deprecated.** Its presentation becomes the object list's
  **comfortable** variant (REQ-22) so that seventeen call sites lose nothing in the swap, and the
  component is deleted in batch 13 with its export, index row and spec. Deleting it earlier does not
  compile; leaving it exported is the fifth answer.
- **The retirement window is guarded** (REQ-94, added at the coverage gate). `CardList` stays
  exported across batches 5 to 12 — the window in which a screen being migrated could acquire a
  **new** call site, which nothing else here would catch, because the migrations remove sites and a
  count that merely fell would still look like progress. Batch 5's INT-12 seeds a **call-site budget**
  in `client/scripts/check-ui-conformance.mjs`, failing when the actual count is higher **or lower**
  than expected; batches 6 to 12 each lower it deliberately (2, 2, 2, 1, 2, 0, 5 — compose holds no
  `CardList`, so a budget that moves there is itself the catch); batch 13 requires **zero** and
  removes the check with the component. The deletion is then a formality rather than a hunt.
- **That budget is the only edit this plan makes to the conformance script, and REQ-84 was narrowed
  to say so.** The script's **blur half is untouched** and `blurAllowedOverlaySelectors` stays
  byte-identical throughout; by batch 19 the file differs from its pre-batch-1 state in nothing at
  all, the budget having been added in 5 and removed in 13. Any other edit to it remains the signal
  that something went somewhere it should not have.
- **The empty state is a requirement on the component, not on the screens.** The three treatments the
  analysis counts are one component rendering whatever subset it was handed — `title` alone from
  compose (`ComposeScreen.tsx:212`), `title` plus a usually-absent `description` from plugins
  (`PluginsScreen.tsx:259`), the full form from registries. The screens did not improvise; the
  component declined to insist. REQ-25 and batch 5's INT-4 are written accordingly: its own surface,
  and an explanation and resolving action that are structural rather than optional. A requirement
  reading "screens must use a consistent empty state" would have left the same component free to
  render three shapes again.
- **`GroupedRowsPanel` is rebuilt on the object-list primitive or retired into it** — one grouped
  list, not a second flat one. It has a single call site (`ComposeScreen:208`), and grouping is a
  genuine capability rather than a near-duplicate, so **the outcome is stated and the mechanism is
  the implementer's**: after batch 11 no screen draws a grouped list any way but the library's one
  way, and no component in the library duplicates another's row rendering.
- **`KeyHint` is deleted** (REQ-93) on the evidence that its only consumer is the badge being
  removed, and on the precedent of `plan-docker_management_app-remove_copy_controls/REQ-6`. A
  palette plan re-adds it in one file.
- **Batch 5 is `modify`-heavy, not `create`-heavy.** Four of the five primitives already exist; see
  the corrections above. An implementer who builds five new components has produced the near-
  duplicates `CLAUDE.md` forbids and has doubled the incoherence rather than removed it.
- **Where a `create` intervention appears, it names a module or an area, never a file.** The
  component does not exist yet; naming it, shaping it and placing it is the implementer's, who then
  records it in `.sdd/modules/`.
- **Every batch carries its own check, written and observed failing first.** The delivered figures
  are on record in REQ-90 for exactly that purpose. On this programme the check is the deliverable at
  risk twice over: a coherence change looks right the moment it is made, and the two defects that
  paid for `CLAUDE.md`'s rules (a control unreachable to a hit test, a surface carried off screen with
  every character intact) are both invisible to a content assertion.
- **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`,
  `npm run test -w client`, and the batch's own e2e specs each on their own. The complete suites are
  the human's, at the end — he runs them on the same daemon, and a concurrent run fails in
  plausible-looking places.
- **No server file is in scope anywhere in this plan**, with one qualification: REQ-58 (`Id` and
  `Digest` showing the same value) may turn out to be the client displaying the wrong field of a
  correct payload — the expected case — or the payload itself carrying one value twice. If it is the
  latter, the batch stops and reports rather than widening into the server on its own initiative.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing in this plan contradicts the analysis. The two factual disagreements (the
"hand-built lists" premise and the "add five primitives" direction) are **corrections to be made in
the analysis**, not departures from it: the requirements were written to survive them, every defect
the analysis reports is honoured, and no scope is narrowed. They are flagged in the plan's final
output so that the analysis's section 1 and section 7.2 are corrected in place, on the precedent of
commit `5f5aa2e`.

Four decisions go beyond the analysis's literal text, each recorded above with its reason and none
widening what is touched: `CardList` is deleted rather than left exported, `GroupedRowsPanel` is
folded into the one paradigm, `KeyHint` goes with the badge it existed for, and the retirement window
is guarded by a call-site budget (REQ-94) — the plan's only edit to the conformance script, added in
batch 5 and removed again in batch 13.

## Coverage check

**Every REQ is served by at least one INT, and every INT serves at least one REQ.** No enabling
intervention is declared anywhere: batch 5 is a **declared foundation batch** — the only non-feature
batch this plan contains, permitted because the five answers must be decided once before any screen
adopts them, and its own requirements (REQ-22 to REQ-30) are verifiable in their own right.

**Which batch each requirement closes in.** Every id from REQ-1 to REQ-93 appears exactly once.
**REQ-94** — added at the coverage gate — is the one requirement deliberately **opened in batch 5 and
closed in batch 13**: it is a guard over the window between them, and it is discharged by the budget
reading zero at the deletion, not by the check merely existing. It is listed against both batches.

| REQ | Closes in | REQ | Closes in |
| --- | --- | --- | --- |
| REQ-1 … REQ-5 | 1 | REQ-49 … REQ-51 | 11 |
| REQ-6 … REQ-11 | 2 | REQ-52 … REQ-56 | 12 |
| REQ-12 … REQ-16, REQ-93 | 3 | REQ-57 … REQ-61 | 13 |
| REQ-17 … REQ-21 | 4 (REQ-21's contexts half in 9) | REQ-62 … REQ-65 | 17 |
| REQ-22 … REQ-30 | 5 | REQ-66 … REQ-69 | 18 |
| REQ-31 … REQ-35 | 6 | REQ-70 … REQ-72 | 15 |
| REQ-36 … REQ-38 | 7 | REQ-73 … REQ-75 | 14 |
| REQ-39 … REQ-41 | 8 | REQ-76, REQ-77 | 16 |
| REQ-42 … REQ-45 | 9 | REQ-78 … REQ-80 | 19 |
| REQ-46 … REQ-48 | 10 | REQ-81 … REQ-92 | 19 (REQ-82 in 13) |

**Five requirements are completed across several batches, and each is declared here.**

- **REQ-82** (no second list paradigm survives) — served by every migration batch, 6 to 13, and
  **closes in 13**, the batch that deletes `CardList` once its last call site is gone. It is false
  until then, however many screens have been migrated.
- **REQ-81** (one answer to each of the five questions) and **REQ-92** (a new screen has no design
  decisions left) — served by 5 and by every batch from 6 to 18, and **close in 19**, counted over
  the shipped screens rather than asserted per screen.
- **REQ-83, REQ-84, REQ-85** (the UI boundary, the blur allow-list, the static background),
  **REQ-88, REQ-89, REQ-90, REQ-91** (how every check is driven and measured) and **REQ-86, REQ-87**
  (section 6 and the certified predecessors) — these are **constraints on every batch, not work**:
  each batch's file restates them and each batch is judged against them, and they **close in 19**
  when the last batch has been judged. A batch that satisfies them alone has not closed them.
- **REQ-45** (Contexts loses the duplicated daemon block) and **REQ-75** (System & prune keeps it)
  are two halves of one decision landing in two batches, 9 and 14. **REQ-45 closes in 9** and is safe
  to land first: the properties already exist on System & prune, so the block is never absent from
  the product between the two batches. 14 does not move them; it verifies they are still there.

**Every REQ ↔ INT mapping lives in the batch files**, in each INT's own `REQ` column — the batch file
being the only file its implementer reads. The mapping was verified in both directions across all
nineteen files while this plan was written, and two gaps found and closed:

- **REQ-21** (a truncated value is still obtainable in full) was closed by no intervention in batch 4;
  its check is now the second half of that batch's INT-2, on the two values the batch ellipsises.
- **REQ-83, REQ-84, REQ-85 and REQ-88 to REQ-91** — the UI boundary, the blur allow-list, the static
  background and the discipline every check is driven by — were written only as constraint prose in
  every batch, which is not an intervention. Batch 19's **INT-9** now serves them: a sweep over the
  whole programme's diff rather than over one batch's, checking the conformance script unmodified and
  `blurAllowedOverlaySelectors` byte-identical against their state before batch 1, and collecting
  every batch's observed-failing figures in one place. It builds nothing, and that is the point: these
  requirements are how the nineteen diffs are judged.

**Batch-level `depends` are declared in the table above**; INT-level dependencies are declared only
inside a batch's own file, per the identifier convention.
