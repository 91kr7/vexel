---
slug: ui-coherence-optimisation
date: 2026-08-14
spec: .sdd/analysis/ui-coherence-optimisation.md
status: validated
---

# Requirements — UI coherence and usability

Programme covering the whole delivered interface: three blocking defects, a missing library layer,
and the migration of thirteen screens onto it. The reference plan for the product itself is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); the certified fix
plans on this branch (bug-1 to bug-5) are **baseline and are not re-opened** — where this work
touches a surface one of them delivered, the requirement below says so by name. Ids are local to
this plan: `REQ-1` here is *not* `plan-docker_management_app/REQ-1`.

**The governing observation is the analysis's own, and it decides the shape of every batch.** The
application has thirteen screens and no shared idea of what a screen is. The material layer —
surfaces, tokens, the glass language — is consistent; the layer above it is not, because each screen
answered on its own *how an object is listed, how its detail is revealed, where its actions live,
what an empty result looks like, how a section is titled*. Restyling screens one at a time would
produce thirteen new answers. So the library gains the missing layer **once**, before any screen is
migrated, and every screen batch afterwards **deletes** a hand-built layout rather than adding one.

**The mockups under `.sdd/analysis/ui-mock/` are not the reference here**, and the analysis says so:
they are a generated sketch. The judgement is made against the running product. Where a requirement
below states a measurement, it is a measurement taken on the delivered build at 1440×1000, 1280×800
or 375×812 and it is the figure the check must be observed failing against.

**Cross-screen requirements are stated once and close last.** Several requirements here — one
section-header treatment, one list paradigm, one detail-panel shape, one empty-state treatment, one
action-cluster rule — are false until the *last* screen adopts them. They are not restated per
screen; `batches.md` declares in which batch each one closes.

## The decisions taken at this gate

Five points needed a human decision rather than an assumption; all five were settled at the
requirements gate, and each is recorded here with the reasoning, because each will be revisited by
someone who was not in the room.

- **The dead `⌘K Search` control** (spec 2.3) → **removed, together with its badge, and nothing
  replaces it** (REQ-14). A command palette is a genuine product feature: it needs its own decisions
  about what it indexes, what selecting a result does, and whether the keyboard is its only route.
  Smuggling that into a plan whose subject is the coherence of existing views would bloat this plan,
  give the palette less thought than it deserves, and delay the blocking repairs of F1–F4. What is
  not acceptable is the present state — a control advertising a shortcut nobody built. Removal ends
  that today. **A command palette is a recommended follow-up report, not deferred scope of this
  plan**; nothing here is written as a half-step towards one.
- **The header `Console` button** (spec 4) → **removed; the `Raw console` navigation entry is the
  single route** (REQ-15). The rail is where destinations live, and a header button that navigates
  like a nav entry while looking like an action is exactly the affordance confusion F3 exists to end.
- **Bulk selection** (spec 3.7) → **out of scope, and knowingly left standing.** Adding bulk stop /
  restart / remove to containers is new destructive function, not a coherence repair; stripping the
  checkbox column from images removes a delivered capability. Both directions are named here so that
  a later plan can pick one up without rediscovering the question: either **selection generalises**
  (the object-list primitive gains a selection variant and containers gain bulk operations, each of
  which needs its own confirmation and failure semantics) or **selection is withdrawn** from images.
  This plan does neither, changes neither screen's selection behaviour, and leaves the images
  checkbox column exactly as delivered.
- **Density and rhythm** (spec 5) → **kept, in trailing batches after the migrations.** The request
  that started this work was explicitly to improve the views graphically, so the items no migration
  discharges for free are in scope. Most of section 5 is discharged for free (plugins' ragged pill by
  F10, registries' alternating heights by F7, the raw console's JSON by F18); what is not — F14
  containers' expanded detail, F15 the dashboard, F19 the dialogs — sits at the end as whole batches,
  so that they can be dropped without disturbing anything upstream if priorities change.
- **The two "which screen keeps it" duplications** (spec 4) → **System & prune keeps the daemon
  properties** (REQ-45, REQ-75) and **the Dashboard keeps the event stream** (REQ-71). The eight
  properties describe *the daemon*, not *a context*: they do not change when you look at a different
  context row, only when you switch which daemon is active — that makes them system information, and
  System & prune is the system screen. About is an identity and licence screen; a live event feed has
  no business on it.

Three duplication points were decided without a question and endorsed at the gate: the images `TAGS`
pill goes while the `REPOSITORY:TAG` column stays (REQ-57); `Id` and `Digest` each show their own
value or the empty one is not rendered (REQ-58); the two sizes are each labelled with what they
measure (REQ-59) — the defect was never that two numbers exist, it was that one word carried both.

## The one design decision, stated rather than assumed

**The object list is delivered by extending `DataTable` with a comfortable variant, not by adding a
second list beside it** (REQ-22). This is what `CLAUDE.md` requires — extend an existing component
with a prop or variant rather than create a near-duplicate, two components that look 90% alike being
exactly the divergence the rule exists to prevent — and it has a consequence that decides the shape
of the whole programme: **the nine migrated screens inherit the F2 column repair by construction**,
instead of each acquiring a column contract of its own. That is what makes F5 a foundation batch
rather than an additive one, and it is why F2 is scheduled before F5 rather than beside it.

---

## F1 — Every navigation destination is reachable, at every viewport

| ID | Requirement |
| --- | --- |
| REQ-1 | **Every one of the thirteen navigation destinations can be reached with a real pointer click, at 1440×1000, 1280×800, 1440×900 and 375×812.** Named because they are unreachable on the delivered build: **System & prune, Raw console, About**. A hit test at **each of the thirteen entries' own centre coordinates** returns the entry itself — not `ui-footer-status`, not a clipped `ui-frame`, not nothing — and the click actually changes the screen. **A count of rendered entries does not satisfy this requirement**: all thirteen were rendered throughout the defect. The check is a hit test plus a real click at the control's coordinates, never `element.click()` and never a dispatched event, because the delivered defect is precisely that the click does not reach the control. |
| REQ-2 | **The rail's entry list and the active-context footer card never paint over each other, at any viewport height.** Below the height at which every entry fits (~964px of viewport on the delivered build), the entry list **scrolls** and the footer card stays anchored and wholly visible; the entry list is clipped to its own box rather than overflowing into the card. Verified by the entries' and the card's viewport boxes, which must not intersect at 1280×800, 1440×900 or 375×812. |
| REQ-3 | **Above that height no dead gap opens.** At 1440×1000 and taller the rail's list and its footer occupy the rail without a large unexplained void between the last entry and the card — the opposite symptom of the same construction, and it must not survive the fix. |
| REQ-4 | **The phone drawer is subject to the same guarantee.** It uses the same construction and today fits at 375×812 by two pixels. Every entry is reachable and every entry's box is inside the drawer's scrollable area at 375×812 **and at 375×667**, which the delivered build fails. |
| REQ-5 | **The rail keeps its blur exactly as delivered.** `.ui-nav-rail` and `.ui-frame__rail` are allow-listed for `backdrop-filter` at the phone breakpoint only, valued `var(--blur-overlay)`, declared on the surface's own `::before`. Making the rail scroll changes none of that: no blur value is written, no surface joins or leaves the allow-list, and `client/scripts/check-ui-conformance.mjs` is not modified. Above the phone breakpoint the docked rail still blurs nothing. |

## F2 — A list row keeps its content below the desktop breakpoint

| ID | Requirement |
| --- | --- |
| REQ-6 | **At 375×812 a container row shows its data.** Name, image, CPU, memory, ports and uptime are rendered at a non-zero width, not merely present in the DOM. The delivered build measures `grid-template-columns: 20px 0px 0px 0px 0px 0px 0px 296px`; **no track of a rendered row measures 0px** after the fix, and each named cell's content box is reachable on screen. **A check that the row still contains its text does not satisfy this requirement**: it contained every character throughout the defect — what it lost was width. The computed grid and the cells' boxes are what is asserted. |
| REQ-7 | **A column has a minimum content width and may not shrink below it.** The library's default column sizing no longer permits a track to collapse under width pressure, and a cell no longer waives the automatic minimum that would have forced an overflow. |
| REQ-8 | **When the minimums exceed the available width, the list scrolls horizontally and scrolling reveals every column.** The enclosing `ScrollArea` measures `scrollWidth > clientWidth` and offers a scrollbar; dragging it brings each named column of REQ-6 fully into view. The row no longer clips its own overflow in a way that defeats the scroll area it sits in. |
| REQ-9 | **The action cluster does not consume the row.** It keeps its intrinsic width and does not grow at the expense of the data columns; on the delivered build it holds 296px of a 375px viewport while six columns hold nothing. |
| REQ-10 | **The repair is made once, in the library, and every adopter inherits it** — containers, images, the dashboard and coverage. No screen carries a local override, a breakpoint-conditional column set or a hand-tuned width to compensate. |
| REQ-11 | **At desktop widths the delivered appearance is unchanged.** Same columns in the same order at the same widths, same alignment, same row height, same inline expansion behaviour, at 1440×1000 and 1280×800 — measured before and after. This is a repair below the breakpoint, not a re-design above it. |

## F3 — The permanent header offers only controls that work, and no second route

| ID | Requirement |
| --- | --- |
| REQ-12 | **No inert control is displayed anywhere in the permanent header, on any of the thirteen screens.** A control that is enabled, styled as a control and does nothing when clicked does not ship. Verified by a real pointer click on every header control on at least two screens, and by the absence in source of an enabled control with no handler. |
| REQ-13 | **No keyboard hint is displayed for a shortcut that does not exist.** A badge reading `⌘K` requires a handler that responds to `⌘K`; there is none anywhere in the client today, for that or any other key. Either the handler exists or the badge does not. |
| REQ-14 | **The `Search` control and its `⌘K` badge are removed from the header** (decided at the requirements gate, with its reasoning, above), on all thirteen screens, and nothing replaces them: no disabled control, no tooltip, no placeholder field, no "coming soon". The header's remaining controls keep their delivered order, spacing and height, and the space is closed up rather than left as a gap. |
| REQ-15 | **One destination is offered by one control.** The header `Console` button and the `Raw console` navigation entry lead to the same screen and are presented as two different kinds of thing; after this change the raw console is reached by its navigation entry, and the header carries no second route to it. Navigating to the raw console still works from the rail and from the phone drawer, and any deep link or programmatic route to it is unaffected. |
| REQ-93 | **The library does not keep the badge component as an orphan.** `KeyHint` has **exactly one consumer in the whole client** — `Shell.tsx:219`, the `⌘K` badge itself — verified at Step 3 against `client/src`. With the badge gone the component, its export from `client/src/ui/index.ts:43`, its index row and its spec go too: a component left in the library unused is the product still offering the affordance in the one place the operator cannot see it, and it is the precedent `plan-docker_management_app-remove_copy_controls/REQ-6` set on this same branch. A command-palette plan re-adds it in one file, which is cheaper than carrying a dead export until then. *(Added after the requirements gate, on evidence found at Step 3; every other id is unchanged.)* |
| REQ-16 | **Nothing else in the header changes.** No control is added, relabelled, re-ordered or restyled; the header's height, its background treatment and its behaviour on scroll are as delivered, measured before and after at all three viewports. |

## F4 — A long identifier never collides with the value beside it

| ID | Requirement |
| --- | --- |
| REQ-17 | **There is one truncation contract, and it lives in the library.** A flexible text laid beside trailing metadata is allowed to shrink and truncates with an ellipsis; the trailing metadata does not shrink. No feature file expresses this itself, and no screen solves it locally. |
| REQ-18 | **No text rectangle overlaps another on the three screens named by the analysis**, at 1440×1000, 1280×800 and 375×812: the **volume mount path** against its size; the **System & prune "Unused volumes"** hash against both its size and its `Prune` button; the **context endpoint** `unix:///Users/…/.docker/run/docker.sock` against the `active` pill. Verified as intersecting bounding boxes, which is what the eye reported as `…c758d3…0B_2b`. |
| REQ-19 | **The contract holds for an arbitrary identifier length.** A 64-character hash is the normal case in this product, not an edge case: with a name of any length the trailing metadata stays at its natural width, in its place, fully legible, and the flexible text truncates instead of pushing or overrunning it. |
| REQ-20 | **A property band still wraps rather than truncates.** The truncation contract governs list rows and single-line meta lines where a value shares its line with a trailing value; it does not reach the two-column property grid, where a value continues to wrap and remain wholly readable — the arrangement `plan-docker_management_app-detail_property_columns` delivered and `plan-docker_management_app-remove_copy_controls/REQ-17` protects. Nothing gains a one-line clamp that turns a layout defect into a data loss. |
| REQ-21 | **A truncated value is still obtainable in full.** Wherever a list row truncates an identifier, that object's detail panel displays the same value in full, wrapped, as selectable text. Truncation is a presentation of a list, never the only presentation of a value. |

## F5 — The library gains the missing layer: five primitives

Foundation. Nothing on screen changes when this feature lands; every feature from F6 onward is
stated against these primitives, and the whole programme's coherence depends on them being designed
once, before the first migration, rather than accreted from whichever screen was migrated first.

| ID | Requirement |
| --- | --- |
| REQ-22 | **One object-list primitive, with a dense and a comfortable variant.** One component with a variant prop — not two components, and not a second list beside `DataTable`: **the delivered `DataTable` is extended** (design decision, stated above with its rationale and its consequence — the nine migrated screens inherit the F2 column repair by construction). It provides aligned columns, a header row, per-row actions, an optional inline expansion and the truncation contract of F4, and both variants are available to any screen. |
| REQ-23 | **One detail-panel primitive.** It is **always** the full width of the screen's content column — never nested inside a narrow card column — it **always** lays properties out in the two-column grid, its values are **always** left-aligned, and tabs are optional. A raw payload block inside it gets the panel's full width, never ~250px. |
| REQ-24 | **At most one detail panel is open at a time within one list.** Opening a second closes the first; a screen can no longer present two parallel long scrolls, as volumes and networks do today. |
| REQ-25 | **The empty state insists on its own shape — this is a requirement on the component, not on the screens that call it.** The three treatments the analysis counts are **one component rendering whatever subset it was handed**: compose passes it a `title` alone (`ComposeScreen.tsx:212`), plugins a `title` plus a usually-absent `description` (`PluginsScreen.tsx:259`), and registries the full form the analysis calls correct. The screens did not improvise; the component declined to insist. So: it **always renders on a surface of the library's own** — an empty result is never bare text floating in the layout, whatever a caller passes — and its **explanation and its resolving action are structural rather than optional**: a caller cannot obtain an empty state consisting of a bare title, and where an action would resolve the condition the API makes its omission a visible decision rather than a default. A requirement written as "screens must use a consistent empty state" would have left the same component free to render three shapes again. |
| REQ-26 | **One section-header primitive, with one treatment.** It replaces the three treatments shipping on the About screen alone (uppercase micro-caps outside a card, sentence case inside a card, uppercase inside a card) and the separate micro-caps field-label treatment used in dialogs. An optional sublabel exists, and where two headers sit side by side, supplying a sublabel to one **does not** shift its neighbour's baseline. |
| REQ-27 | **One action-cluster primitive, carrying one rule** for what is a button, what is a menu item and what may be text. **Bare text is never a control**: `use`, `+ Attach`, `Add variable` and `Add port mapping` are controls and must look like controls. The rule is expressed by the primitive's API — a caller declares actions and their weight, not their appearance — so a screen cannot re-answer it. |
| REQ-28 | **All five are domain-agnostic library components.** No Docker vocabulary in their names, props or copy; no API call, no data fetching; data and callbacks arrive as props; every raw DOM tag and every line of CSS they need lives under `client/src/ui/`; each has a typed public API and is exported from the library's public entry point before any feature consumes it. |
| REQ-29 | **Each primitive is covered by its own unit tests**, exercising every variant and every state it offers (dense and comfortable; tabbed and untabbed; empty state with and without an action; a header with and without a sublabel; each action weight), so that the migrations that follow rest on tested behaviour rather than on their own first use of it. |
| REQ-30 | **No screen changes in this feature.** With the primitives added and exported and nothing yet consuming them, all thirteen screens render exactly as before at all three viewports. This is the declared foundation, and its cost is that it is invisible; a screen that moved is a sign the work leaked into the feature layer. |

## F6 — Volumes and networks are listed and revealed like every other object

| ID | Requirement |
| --- | --- |
| REQ-31 | **Volumes and networks are listed with the object-list primitive**, and their hand-built stacked-card lists are **deleted**, not left standing beside it. Columns align down the list, and the mount path obeys F4. |
| REQ-32 | **Their detail is revealed by the detail-panel primitive, at full content width.** The expansion is no longer confined to the narrow card column; values no longer wrap mid-hash; the `RAW PAYLOAD` block gets the full width instead of ~250px. |
| REQ-33 | **Only one panel is open at a time on this screen**, closing the delivered case of two independent panels open together (REQ-24 observed here). |
| REQ-34 | **The network `Options` value is left-aligned**, like every other value in the product; no value on this screen is right-aligned. |
| REQ-35 | **This screen's actions obey the one rule**: the per-card header action buttons and the bare-text `+ Attach` are expressed through the action cluster, so the screen has page-level actions where page-level actions belong and row-level actions in the row. Every operation available on the delivered build is still available and still performs the same operation. |

## F7 — Registries

| ID | Requirement |
| --- | --- |
| REQ-36 | **Registries are listed with the object-list primitive**, hand-built cards deleted; each row's `Log in` / `Log out` is an action of the cluster, not a trailing one-off button. |
| REQ-37 | **Row heights no longer alternate down the column.** `authenticated · credential store: desktop` and `not authenticated` occupy the same number of lines at 1440×1000 and 1280×800 — measured as equal row boxes — instead of one wrapping to two lines and the other not. |
| REQ-38 | **The delivered empty state is preserved in the primitive's form.** `Search Docker Hub` plus its explanatory line is the one the analysis calls correct; it survives as a title, one line and the resolving action, with the same words, and nothing about this screen's search or authentication behaviour changes. |

## F8 — Builders and build cache

| ID | Requirement |
| --- | --- |
| REQ-39 | **Builders and build cache are listed with the object-list primitive**, hand-built cards deleted, and each row's mixed cluster — `running` · `cache 14.6MB` · `in use` · `Remove` — is expressed as a status column plus an action cluster, so a pill, a plain string and a button are no longer one undifferentiated line. |
| REQ-40 | **A builder's name appears once per row.** The delivered row prints it as its title and again as a third line; one of the two goes, and no other property of the row is lost with it. |
| REQ-41 | **Page-level actions exist where the screen has them**, in the toolbar under the header rather than in a card header, and every operation available on the delivered build still performs the same operation. |

## F9 — Contexts

| ID | Requirement |
| --- | --- |
| REQ-42 | **Contexts are listed with the object-list primitive**, and the cards-with-inline-trailing-buttons paradigm — the fourth of the four the analysis counts — is deleted. |
| REQ-43 | **`use` is a control that looks like one.** The bare text that switches context becomes an action of the cluster; it performs exactly the same switch, with the same confirmation or immediacy as delivered. |
| REQ-44 | **The endpoint no longer collides with the `active` pill** (REQ-18 observed here), at all three viewports. |
| REQ-45 | **The second full eight-property daemon block does not survive on Contexts.** The same eight properties — Docker version, Engine API, BuildKit, storage driver, cgroup driver, OS/arch, root directory, containers running — are listed here and on System & prune today; **System & prune keeps them** (decided at the gate: they describe the daemon, not a context, and do not change as you look down the context list), and Contexts no longer repeats the block. **This forbids the duplicated block, not every daemon fact on Contexts**: if the natural design for the active context's row is a short summary of two or three properties — version and endpoint, say — that is permitted and is not a reinstatement of the duplication. Nothing is lost: every one of the eight remains readable on System & prune. |

## F10 — Plugins

| ID | Requirement |
| --- | --- |
| REQ-46 | **Plugins are listed with the object-list primitive**, hand-built cards deleted. |
| REQ-47 | **The `enabled` pill is column-aligned.** Its left edge is identical on every row — measured — regardless of the length of that row's version string; a longer version such as `v0.36.0-desktop.1` no longer pushes its row's pill out of line with its neighbours'. |
| REQ-48 | **`No daemon plugins` becomes a real empty state** — the primitive, on a surface, with a title, one line of explanation and, where one exists, the action that resolves it — instead of bare text floating in the layout. |

## F11 — Compose

| ID | Requirement |
| --- | --- |
| REQ-49 | **Compose lists its projects with the object-list primitive.** The screen that has no list at all acquires the one every other screen uses; each project is a row, with its actions in the cluster. |
| REQ-50 | **A project's detail is revealed by the detail-panel primitive**, full width, two-column grid, tabs where the screen needs them. |
| REQ-51 | **`No compose projects` becomes a real empty state**, on a surface, with a title, one line and the resolving action — replacing bare text on no surface. |

## F12 — Swarm

| ID | Requirement |
| --- | --- |
| REQ-52 | **One fact is stated once.** The delivered screen states "this daemon is not part of a swarm" **five times**: once in the banner and once in each of four cards. After this change the inactive-swarm condition is stated once, on one surface. |
| REQ-53 | **The actions that resolve the condition sit with the statement of it.** `Initialise a swarm` and `Join an existing one` belong to the empty state that explains the condition, not to a banner above four empty states that repeat it. Both actions still perform exactly what they perform today. |
| REQ-54 | **The bottom row aligns.** `Configs & stacks` carries a `CONFIGS` sublabel that `Secrets` does not, and the two sit at different heights; after this change side-by-side headers share a baseline and the two cards' contents start at the same y (REQ-26 observed here) — measured, not judged by eye. |
| REQ-55 | **Swarm's lists use the object-list primitive and its detail the detail-panel primitive**, on a swarm-active daemon: nodes, services, stacks, secrets and configs. |
| REQ-56 | **What cannot be exercised is skipped with its reason stated.** Nothing in this work initialises a swarm on the operator's daemon; checks that require a swarm manager skip and say why, exactly as the certified sibling plans' did. The inactive-swarm presentation — which is what the analysis actually measured — is checked unconditionally. |

## F13 — Images and layers: one fact, one place; two sizes, two names

| ID | Requirement |
| --- | --- |
| REQ-57 | **The images list does not print the same string twice per row.** `REPOSITORY:TAG` and `TAGS` carry the identical value on every row today (`alpine:3.20` beside a pill reading `alpine:3.20`); after this change a row states it once. Where an image genuinely carries several tags, all of them remain visible. |
| REQ-58 | **`Id` and `Digest` no longer display the same value.** Either each shows the value it names — the image id and the repository digest being different things — or the field that has nothing of its own to show is not rendered. No field displays a value belonging to another field. |
| REQ-59 | **The two sizes are named, and the contradiction ends.** The row reads `13.0MB` where the panel reads `3.9MB` under one word. Each number is labelled with what it measures, the two labels differ, and the same label never carries two values in one product. |
| REQ-60 | **An empty collapsible section is not drawn.** A `Labels` section with a count of `0` — on image and container panels alike — is absent rather than present-and-empty. A section with content is unchanged. |
| REQ-61 | **The images screen's detail panel is the primitive**, keeping its delivered content: the same properties, the two-column grid, the collapsible sections that have content, and the layer explorer. `plan-docker_management_app-detail_property_columns`' column rule and `plan-docker_management_app-remove_copy_controls`' outcome are preserved exactly — no column count moves at the same measured section width. |

## F14 — Containers: the expanded detail stops fighting for room

Spec section 5, kept in this plan by the gate's decision and scheduled after every migration, so that
it can be dropped as a whole batch without disturbing anything upstream.

| ID | Requirement |
| --- | --- |
| REQ-62 | **The logs toolbar is not three stacked rows.** stdout/stderr, timestamps, line count, since, until, the filter with previous/next, and `Download` occupy fewer rows than the delivered three, and **no row holds a single button alone**. Every control keeps its function and its delivered behaviour; this is an arrangement change, not a capability change. |
| REQ-63 | **The stats tiles do not orphan a metric.** Five metrics in a four-column grid leave `PIDS` alone on a second row; after this change the grid's column count and the metric count agree at 1440×1000 and 1280×800, with no orphan. |
| REQ-64 | **The tiles are uniform.** Either every tile carries the progress bar or the two that do are distinguished by something other than an inconsistency — a tile without a measurable maximum does not merely look like a tile whose bar failed to render. |
| REQ-65 | **The container detail panel is the primitive**, with its tabs (Logs, Stats, Config, Processes, Inspect, Exec, Attach) and its two-column property grid preserved, and with REQ-60 applied to its empty `Labels` section. Every certified behaviour of this panel — bug-1's progress dialog, bug-4's column rule, bug-5's absence of copy affordances — is undisturbed. |

## F15 — Dashboard

Spec section 5, kept by the gate's decision, scheduled after every migration and droppable as a whole.

| ID | Requirement |
| --- | --- |
| REQ-66 | **The middle row's two cards share a bottom edge.** `Container activity` and `Disk usage` measure the same height at 1440×1000 and 1280×800 — measured, not eyeballed. |
| REQ-67 | **The disk-usage chart explains its colours.** The two hues carry a legend naming what each means; no colour in the chart is unexplained. |
| REQ-68 | **Zero is distinguishable from unmeasured.** A row whose value is `0B` renders something that reads as zero — a zero-length bar with its track, or an explicit `0B` marker — so that the reader can tell it from a row that was not measured. |
| REQ-69 | **The dashboard's lists and empty states use the primitives**, and its `DataTable` usage inherits F2 without a local override. |

## F16 — About

| ID | Requirement |
| --- | --- |
| REQ-70 | **The About screen carries one section-header treatment.** `IDENTITY AND LICENSE`, `CLI availability` and `DAEMON EVENT STREAM` are three treatments on one screen today; they become one, the primitive's (REQ-26). No section title on this screen is styled locally. |
| REQ-71 | **The daemon event stream is presented in one place in the product.** About repeats the Dashboard's stream verbatim; after this change **the Dashboard carries it and About does not** (decided at the gate: About is an identity and licence screen). The stream itself, its connection handling and its content are unchanged where it stays. |
| REQ-72 | **Everything else About states is preserved**, in the same words: the identity and licence block, the CLI availability block, and the notice `plan-docker_management_app-about_license_notice` delivered. |

## F17 — System and prune

| ID | Requirement |
| --- | --- |
| REQ-73 | **The prune rows are preserved exactly.** They correctly distinguish actionable from inert and their destructive actions are correctly red-tinted; the analysis names this as already right. No prune row changes what it prunes, what it says, or when it is enabled. |
| REQ-74 | **The callout style survives untouched.** It is one style used twice, correctly, on this screen and on Raw console; it is not restyled, not replaced by the empty-state primitive and not absorbed into the section header. |
| REQ-75 | **This screen's sections, lists and empty states use the primitives**, its `Unused volumes` row obeys F4 (REQ-18), and **the eight daemon properties stay here**, unchanged in content and wording — this is the screen that keeps them under REQ-45. |

## F18 — Raw console

| ID | Requirement |
| --- | --- |
| REQ-76 | **The daemon payload wraps.** It renders today as an unwrapped wall of JSON breaking mid-token; after this change no line breaks mid-token, the block stays inside its surface at all three viewports, and the payload remains real, complete, selectable text. |
| REQ-77 | **The transcript is otherwise as delivered.** Every entry keeps `Re-run` and its status badges with their delivered spacing, the history behaves as delivered, and no copy affordance returns. |

## F19 — Dialogs

Spec section 5, kept by the gate's decision, scheduled last and droppable as a whole.

| ID | Requirement |
| --- | --- |
| REQ-78 | **A dialog is not boxes inside boxes.** A field group is not its own nested sub-card; the vertical extent of a dialog with the delivered field count is measurably shorter than the delivered one at 1280×800, and the arrangement no longer reads as a stack of cards inside a card. |
| REQ-79 | **Dialog field labels use the one label treatment** rather than a fourth section-header style of their own (`IMAGE`, `ENTRYPOINT`, `COMMAND`). Every field keeps its label text, its association with its input, and its validation behaviour. |
| REQ-80 | **`Add variable` and `Add port mapping` are controls that look like controls** (REQ-27 observed here), and `plan-docker_management_app-dialog_sizing`, `plan-docker_management_app-privileged_toggle_verification` and `plan-docker_management_app-toggle_focus_scroll` are preserved: the dialog's sizing rules hold, and no control drags its dialog out of the viewport when focused or operated. |

## F20 — What must not be lost, and how all of it is checked

| ID | Requirement |
| --- | --- |
| REQ-81 | **The five questions have exactly one answer each across the whole product.** One way an object is listed (the primitive, in two variants), one way detail is revealed, one place actions live, one empty-state treatment, one section-header treatment. Counted over the shipped screens at the end of the programme, not asserted per screen: four list paradigms become one, six action affordances become one rule, three toolbar placements become one, three detail-panel shapes become one, three empty-state treatments become one, four section-header styles become one. |
| REQ-82 | **No second list paradigm survives, anywhere.** Each migration **deletes** the arrangement it replaces; no screen keeps its old one behind a flag, a variant or a dead branch; and — this being what the delivered build actually holds, see the correction in `batches.md` — **`CardList` is removed from the library**, with its export, its index row and its spec, once its last call site is migrated. A list component left exported is the next screen's fifth answer. Grep-able, and checked as such. |
| REQ-83 | **The UI boundary holds absolutely.** After every batch, no file outside `client/src/ui/` emits a raw DOM tag, imports or declares CSS, carries a `style={{…}}`, or hard-codes a colour, radius, blur, spacing, shadow, font size or z-index. Every new primitive, variant, token and prop is added to the library and exported **before** any feature consumes it. The one escape hatch — a genuine technical necessity — is used only with a comment on the spot stating why the library could not cover it. |
| REQ-84 | **The blur allow-list is unchanged, and that is asserted rather than hoped.** `client/scripts/check-ui-conformance.mjs` stays green after every batch — it already fails on a stray `backdrop-filter` or `filter: blur(...)`, and on an allow-listed one not valued `var(--blur-overlay)` — and **`blurAllowedOverlaySelectors` stays byte-identical to its state before batch 1**, which is the half a green run cannot show. The migrations touch a great many surfaces and none of them is an overlay: the scrims still dim without blurring, the session-ended overlay still declares `backdrop-filter: none`, and no blur is declared on a surface element rather than on its `::before`. **The script's blur half is not edited at all, and an edit to it is a signal that something went wrong, reported rather than made.** Its boundary half receives **exactly one planned addition** — the call-site budget of REQ-94, added in the foundation batch and retired when it reaches zero; anything else added to this file is the same signal. |
| REQ-94 | **No new call site of the retiring list component appears while it is being retired.** `CardList` stays exported across the eight batches between the foundation batch and its deletion, which is exactly the window in which a screen being migrated could acquire a **new** one, and nothing else in this plan would catch it: the migrations remove call sites, so a count that merely fell would still look like progress. A build check therefore holds the **expected number of call sites**, seeded with the count measured at the start of the programme, failing when the actual count is higher **or lower** than expected — so each migration must lower it deliberately — and required to be **zero** at the deletion. The deletion is then a formality rather than a hunt. *(Added after the coverage gate, on the human's instruction; every other id is unchanged.)* |
| REQ-85 | **The background stays static and pre-blurred** and the main view computes no filter: nothing added here animates the backdrop, and no primitive introduces a filter, a transition or an animation on a surface that scrolls with the content. |
| REQ-86 | **Section 6 of the analysis does not regress**, item for item: the glass material, background and token discipline stay consistent everywhere; the two-column property grid keeps the shape that made it worth generalising; destructive actions stay red-tinted and the prune rows stay correctly distinguished; the callout style stays one style used twice. |
| REQ-87 | **Every certified predecessor stays certified.** bug-1 (progress completion), bug-2 (route into the filesystem browser), bug-3 (its interior layout), bug-4 (the detail property column rule, its property set, ordering and content classes) and bug-5 (no copy affordance anywhere, nothing reaching the clipboard) are verified undisturbed by the batches that touch their surfaces, and are named in those batches' checks rather than assumed. |
| REQ-88 | **Every interaction is driven with a real pointer at the visible control's coordinates** — opening a row, opening a panel, switching a tab, clicking a navigation entry, operating a toolbar control — never `element.click()`, never a dispatched event, never a visually hidden target. The navigation defect (REQ-1) is the case that proves it: it is invisible to a programmatic activation and immediate to a real click. |
| REQ-89 | **A check for "the layout broke" asserts geometry, not content.** Viewport boxes before and after the interaction, the operated control still inside the viewport, and — for the defects this plan repairs — track widths, box intersections, row heights, column left edges and card heights, at 1440×1000, 1280×800 and 375×812. Content assertions stand beside those, never instead of them: a surface that kept every character while being carried off screen is the defect that paid for this rule. |
| REQ-90 | **Each check is observed failing on the delivered build, with its figures**, and the implementer reports the before and after measurements side by side. The delivered figures are on record for that purpose: `grid-template-columns: 20px 0px 0px 0px 0px 0px 0px 296px`; three navigation entries unreachable at 1280×800; a nav list of ~849px intrinsic height and a phone list of 810px against 812px; a Search control with no `onClick` and no key handler in the client; overlapping text rectangles on three screens; one fact stated five times on swarm; `13.0MB` against `3.9MB`. "Before: failed" with no figures is not evidence. |
| REQ-91 | **Verified against the real daemon, under the project's test discipline**: own fixtures carrying the ownership labels, full cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, no inherited application state, its own data directory, no test reaching Docker Hub, and every spec passing on its own. English only in source, identifiers and comments; kebab-case for every new file and folder. |
| REQ-92 | **The measure of success is stated as a requirement because it is the point of the programme**: a screen not yet written has no design decisions left to make. At the end, a new screen is composed from the primitives without inventing a list, a panel, an empty state, a section header or an action rule — and that is demonstrated by the fact that the last migrated screen added no new primitive, no new variant and no new prop to the library. |
