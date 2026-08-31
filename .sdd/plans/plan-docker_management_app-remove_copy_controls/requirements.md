---
slug: docker_management_app-remove_copy_controls
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-remove_copy_controls.md
status: validated
---

# Requirements — Every copy affordance leaves the client

Fix of the delivered product; bug-5 of the human's `bugs.md`, and the last of a tranche of five
worked one at a time. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md). Four delivered,
certified siblings on this branch are **baseline and are not re-opened**:
[`plan-docker_management_app-progress_completion_autoclose`](../plan-docker_management_app-progress_completion_autoclose/requirements.md)
(bug-1),
[`plan-docker_management_app-filesystem_browse_direct`](../plan-docker_management_app-filesystem_browse_direct/requirements.md)
(bug-2),
[`plan-docker_management_app-filesystem_browser_layout`](../plan-docker_management_app-filesystem_browser_layout/requirements.md)
(bug-3 — whose delivered entry-metadata pane holds one of the controls removed here) and
[`plan-docker_management_app-detail_property_columns`](../plan-docker_management_app-detail_property_columns/requirements.md)
(bug-4 — whose REQ-32 fenced this control off, and whose measurements were taken **with the control
present**; both are discharged here). Ids are local to this plan: `REQ-1` here is *not*
`plan-docker_management_app/REQ-1`.

**The instruction is one line with four exclamation marks, and it admits no partial reading.** There
is no conditional removal, no replacement affordance and no "keep it for the ids" in scope. What
needs judgement is not *how* but *what it costs*, and the three costs are requirements here (F5) so
that the human finds them on the record rather than as a surprise.

**Absence is a behaviour, not a label.** Every instance in the delivered build happens to say `Copy`,
which is a fact about this build and not a property of the design — the component's own `label` prop
makes an icon-only or differently-worded instance one edit away. A check written against the string
would pass on a build that still ships the thing. F7 states the check in the form that cannot be
satisfied by a rename.

**The removal is one component wide and twenty-four sites deep**, and the inventory below is the
checklist, not a sample.

## The inventory — corrected against the delivered source

The analysis states **"twelve `copyValue` props across eleven files"**, **"twenty-two instance
sites"** and **"nine screens"**. All three figures were checked against `client/src` while writing
this plan, because a removal certified against an understated checklist leaves a control shipping —
which is the report's own first-named risk. **Every list the analysis gives is right; three of its
totals are not**, and in each case the total disagrees with the analysis's own enumeration
immediately beside it:

- **Thirteen `copyValue` props across eleven files** — the analysis's own enumeration lists thirteen
  and totals them as twelve. `ImageDetailPanel.tsx:57`, `ContainerDetailPanel.tsx:373` and `:375`,
  `VolumesPanel.tsx:101`, `RegistriesScreen.tsx:307`, `SwarmNodesPanel.tsx:105`,
  `SwarmSecretsPanel.tsx:111`, `SwarmConfigsStacksPanel.tsx:145`, `SwarmServicesPanel.tsx:214` and
  `:215`, `PluginsScreen.tsx:59`, `LayerExplorer.tsx:235`, `FilesystemBrowser.tsx:340`.
- **Twenty-four instance sites, not twenty-two**: 13 `copyValue` props + 6 `CodeViewer` + 2
  `LogStream` + 1 `ConsoleSurface` + 2 `RevealableValue`. The four component counts are confirmed
  exactly as the analysis states them, site for site; only the props total, and therefore the sum,
  move.
- **Eight screens, not nine** — the analysis's own list names eight and totals them as nine: images
  & layers, containers, volumes & networks, swarm, plugins, registries, compose, raw console. No
  ninth screen carries one: the sixteen files holding an instance map onto those eight and no other,
  and volumes & networks is a single screen in this product, as is images & layers.

Everything else in the analysis's inventory is confirmed as written: one clipboard call
(`CopyButton.tsx:21`), one export (`ui/index.ts:58`), five library render sites, and no instance
labelled anything but `Copy` on this build. **The enumeration governs, never the figure** — and
three of these sites render one control *per row* (console entries, health-log blocks, definition
bands), so the count on screen is not fixed even once the site count is.

## F1 — No copy affordance is offered anywhere in the client

| ID | Requirement |
| --- | --- |
| REQ-1 | **No copy affordance is offered on any surface of the shipped client.** Not on the image detail panel's `Id`; not on the container `Inspect` tab's `Id` or `Image`; not on the volume `Mountpoint`; not on the registry pull `Reference`; not on any swarm node, secret, config or service id, nor on a service image; not on the plugin `Name`; not on the layer explorer's `Build step`; not on the filesystem browser's entry `Path`; not above any raw payload block or any health-log block; not above any log stream; not on any raw-console entry; not beside either swarm join token. **Eight screens** — images & layers, containers, volumes & networks, swarm, plugins, registries, compose, raw console — and the inventory above is the checklist. |
| REQ-2 | **Nothing in the shipped client reaches the clipboard API.** No `navigator.clipboard`, no `writeText`, no `execCommand('copy')`, no copy-on-click on a value, no copy keyboard shortcut, no context-menu copy entry, no third-party clipboard helper — in the client source that ships, and no clipboard write observable at runtime on any of the nine screens. This is the form of the statement that a rename cannot satisfy, and it is the primary statement; REQ-1 is its visible half. |
| REQ-3 | **Nothing replaces the removed control.** No context-menu entry, no copy-on-click, no keyboard shortcut, no click-to-select-all, no icon-only variant, no hover-revealed control, no breakpoint-conditional control, no `title` attribute carrying a full value, no widening of a shortened value to compensate. Each of these is the same affordance under another name, and the instruction admits none of them. |
| REQ-4 | **The confirmation state goes with the control.** The string `Copied` and the 1.5-second timer that swapped the label disappear from the product; no transient state, no timer and no residue of one is left behind on any surface. |
| REQ-5 | **The client asks for no clipboard permission, and no automated check grants one.** The three Playwright `grantPermissions(['clipboard-read', 'clipboard-write'])` calls go with the coverage that needed them, and no clipboard API is stubbed anywhere in the suite. Dead scaffolding for a capability nothing uses is how the next reader is misled about whether the removal was complete. |

## F2 — The library shrinks properly: removed, not orphaned

| ID | Requirement |
| --- | --- |
| REQ-6 | **The component itself is deleted.** `client/src/ui/controls/CopyButton.tsx` — the file, the component, its props type — and its export from the library's public entry point (`client/src/ui/index.ts:58`) no longer exist. A component left in the library unused would mean the product still ships the thing the human asked to remove, in the one place he cannot see it, and still offers it to the next feature that imports the library. |
| REQ-7 | **The five library render sites no longer render it**, and none of them grows a replacement: the property band (`DefinitionList`), the code viewer (`CodeViewer`), the log stream (`LogStream`), the console entry (`ConsoleSurface`, one per transcript entry) and the revealable value (`RevealableValue`). Each keeps everything else it draws. |
| REQ-8 | **The `copyValue` field of the definition-list item type is removed from the library's public API** — removed, not deprecated and not defaulted: a caller that passes one **does not typecheck**. A field left on the type with no renderer is the same orphan as an unused file, one layer up. |
| REQ-9 | **All thirteen feature props are gone**, across the eleven files of the inventory above, and no feature file anywhere in `client/src` passes a copy value, a copy label or a copy flag to a library component after this change. Nothing else in any of those files moves: no property is added, removed, renamed, reordered or reformatted, and no file gains a `style`, a raw DOM tag or a CSS import. |
| REQ-10 | **No orphan of any kind survives the removal**, in the library or in feature code: no unused import, no dead prop or dead type member, no orphan file, no leftover string, no unused style rule, no unused test helper, no unused clipboard stub or fixture. This is grep-able and is checked as such, not asserted in prose. |

## F3 — The surfaces are still correct without it

| ID | Requirement |
| --- | --- |
| REQ-11 | **The code viewer's action row does not survive as an empty strip.** The control was its only child, so with no children the row draws nothing at all: no height, no padding, no border, and no gap consumed from its parent. A strip of dead space above every raw payload block on six sites is a visible defect introduced by a cosmetic fix. |
| REQ-12 | **The log stream's action row renders nothing at all when it would otherwise be empty** — the case of a stream offered without a download filename, which is Compose whenever no project is selected. Where a download filename *is* given, `Download` sits exactly where it does today, with its delivered spacing. |
| REQ-13 | **The three containers that keep other children keep their delivered appearance**: the property band's value sits correctly as a single child, with the band's own padding, type and label→value gap unchanged; the console entry's action group keeps `Re-run` and its status badges with their delivered spacing; the revealable value's action group keeps `Show`/`Hide` and the rotate action with theirs. Nothing shifts sideways or re-centres because a sibling left. |
| REQ-14 | **The property bands become uniform in height, the `Id` band included.** The delivered `Id` band measures **43px against its neighbours' 33px** on the image detail panel, purely because it holds the control; after the removal it measures **33px, the same as its neighbours**. This is stated as an expected measurement rather than as a side effect noticed afterwards: it is the cheapest positive evidence that the control is gone from the band rather than relabelled inside it. |
| REQ-15 | **bug-4's delivered arrangement is otherwise unchanged**: the same properties, in the same order, in the same content classes, under the same column rule, with the same transition widths and **the same column count at the same measured section width**. The property section is marginally *shorter*, which satisfies bug-4's height ceilings a fortiori. The minimum band width derives from `Created`, the longest value, not from the `Id` band — so **no column count changes, and bug-4's arithmetic is not re-opened**. A plan or a pass that re-tunes the column rule to "restore" a height that changed for this reason has gone wrong. |

## F4 — What must remain exactly as it is

| ID | Requirement |
| --- | --- |
| REQ-16 | **Every value the control used to copy is still displayed, with the same text, in the same place, in the same band or block.** Nothing is added, removed, widened, shortened, reformatted, relabelled, reordered or moved behind a disclosure. In particular the image panel's `Id` still reads `sha256:` plus twelve characters, the container `Inspect` tab's `Id` still reads twelve characters, and the server-shortened `Digest` keeps exactly its delivered presentation. This report removes a control; it changes nothing the product says. |
| REQ-17 | **Every one of those values remains selectable with the mouse and with the keyboard.** No surface gains `user-select: none`, an overlay that swallows the pointer, an ellipsis-with-`title` presentation or a hidden overflow. A property value continues to **wrap rather than truncate**, and a raw payload continues to be real selectable text in a real scroll area. Turning a convenience loss into a data loss by "finishing" a band with a one-line clamp is refused. |
| REQ-18 | **The existing alternatives keep working, unchanged**: the `Raw payload` block on the image and container detail panels, `Download` on the log stream, `Show`/`Hide` and the rotate action on a revealable value, the health-log blocks' own content, the console transcript and its `Re-run`, and the browser's own selection and copy shortcut — which belongs to the platform, is not a product affordance, and is not the product's to remove. xterm.js's selection in the terminal is likewise untouched. |

## F5 — The three costs, recorded rather than mitigated

These are consequences the human is to read, not problems the plan is to solve. Each is stated with
the fallback that genuinely remains, so that "recorded" is a verifiable claim and not a shrug.

| ID | Requirement |
| --- | --- |
| REQ-19 | **A full image or container id is obtainable only by hand-selection inside the raw payload block.** Both panels display the id shortened and both carry the Engine's own inspect JSON below the properties, containing the full `Id` as selectable text on the same surface — and that block is verified still present, still complete and still selectable. **Recorded consequence, not mitigated**: obtaining a ~71-character image id or a 64-character container id stops being one click and becomes scrolling to the payload, finding the field and hand-selecting a long string inside a scrolled block. The image panel's `Digest` was **already** in this state before this report (the server shortens it and it never had a control), and is not attributable here. |
| REQ-20 | **A whole log buffer can no longer be put on the clipboard at all**, and the reason is structural rather than incidental: the log stream is virtualised, so only the visible slice is in the DOM and a manual select-all captures the rendered window, never the buffer. `Download` is the equivalent that remains, and it is verified to still deliver the whole buffer on the container logs view — and on Compose **only while a project is selected**, which is delivered behaviour, unchanged here, and named so that the gap is a known one rather than a later discovery. **Recorded consequence, not mitigated.** |
| REQ-21 | **A swarm join token can no longer be taken without being displayed.** The revealable value existed to hold a value masked until an explicit reveal and copyable without ever being shown; the copy control was the route that never displayed it. Afterwards the only route is `Show` — the token is drawn on screen and selected by hand, which on a shared screen, a projector or a recorded session exposes a secret where it previously need not have been. The masked default, `Show`/`Hide` and the rotate action are verified still working. **Recorded consequence, accepted and not mitigated**: this is the sharpest cost in the tranche and the item most likely to draw a follow-up request. |

## F6 — The records catch up with the product

| ID | Requirement |
| --- | --- |
| REQ-22 | **No module index or component spec is left describing a control that does not ship.** The `CopyButton` row in `.sdd/modules/ui-library/index.md` and its `specs/copy-button.md` go — a spec for a deleted component is an orphan of the same kind as an unused file — and the copy clauses are removed from the specs of the definition list, the code viewer, the log stream, the console surface, the revealable value, the container detail panel, the container logs view, the raw console screen, the swarm screen and the layer explorer. English only. |
| REQ-23 | **`plan-docker_management_app/REQ-26` is narrowed, and recorded as a narrowing.** *"The raw inspect payload of a container is viewable and copyable as-is"* becomes **viewable and selectable** as-is. The narrowing is written **in place, in the delivered plan's own `requirements.md`, as a dated amendment beside the delivered text** — not as an edit that hides what the requirement used to say, and not only in this plan, which the reader of the delivered one would never reach. The reason travels with it: the product's own base analysis contains **no copy or clipboard requirement whatsoever** — the affordance entered downstream, at the plan and spec phases — so what is narrowed is a requirement derived downstream, and nothing in the product's analysis is contradicted. A later reader must be able to see this is a withdrawal on the reporter's own instruction, not a regression that slipped through. |
| REQ-24 | **bug-4's records that were measured with the control present are updated, and only those.** Four places, enumerated: (1) the note at `client/e2e/image-detail-property-columns.spec.ts:328-330` stating the `Id` band measures 43px against its neighbours' 33px *because it holds the copy control*, together with the wrap heuristic it justifies — after this fix it describes a build that no longer exists; (2) the assertion at `:263-266` that a `Copy` **is** visible in the `Id` band, which **inverts**; (3) the two comments excluding a `Copy`'s text from the measured text rectangles, at `client/e2e/support/property-bands.ts:132` and `client/e2e/property-columns-rule.spec.ts:134` — the helper stays correct, since it excludes control text generically, and only the comments stop describing anything; (4) `plan-docker_management_app-detail_property_columns/REQ-32`, the fence that reserved this control for bug-5, which **this plan discharges**. Nothing else of bug-4 moves. |

## F7 — How this is checked, stated because this report's failure mode is a check that passes

| ID | Requirement |
| --- | --- |
| REQ-25 | **Absence is asserted by behaviour, in two halves.** (a) Nothing in the shipped client reaches the clipboard API — asserted over the client sources that ship *and* observed at runtime, with no clipboard write occurring on any of the eight screens; (b) no control offering it exists on the surfaces that had one. **A check written only against the string `Copy` does not satisfy this requirement**: it would pass with an icon-only instance still shipping, and equally with one relabelled `Copy id`. Stated as a requirement because it is the exact mistake available here. |
| REQ-26 | **The surfaces are enumerated, not sampled.** All eight screens and all **twenty-four** instance sites of the inventory above are covered — including the three that render one control per row, where the check must hold for **every** row present and not for the first one. A check that opens the image detail panel and stops has verified the screenshot, not the instruction. |
| REQ-27 | **Every interaction is driven with a real pointer at the visible control's coordinates**: expanding an image row or a container row, opening the `Inspect` tab, opening a collapsible section, selecting a layer, entering the filesystem browser, revealing a token, selecting a compose project. Never `element.click()`, never a dispatched event, never a visually hidden target. |
| REQ-28 | **The check is observed failing on the delivered build**, and the delivered figures are on record for that purpose: one clipboard implementation, one export, five library render sites, thirteen `copyValue` props, twenty-four instance sites, eight screens, every instance labelled `Copy`, and an `Id` band of 43px against its neighbours' 33px. The implementer reports what the check measured **before** the removal beside what it measures after; "before: failed" with no figures is not evidence. |
| REQ-29 | **Content assertions stand beside the behavioural ones, never instead of them**: each affected value is still displayed with its exact text (REQ-16) and is still selectable (REQ-17). A surface that lost its control *and* its value has passed half a check — and a surface that kept its value and merely renamed its control has passed the other half. Both halves, on every enumerated surface. |
| REQ-30 | **The coverage that exercised copying is removed rather than neutered, and its neighbours survive.** The copy assertions sit inside files that also check the panel's own content, the revealable value's disabled state and the console entry's transcript; those assertions are **kept, moved or restated**, never deleted along with the file. The affected coverage is enumerated: unit — the whole of `copy-button.test.tsx`, plus `console-surface.test.tsx:137,147`, `revealable-value.test.tsx:79,102,139`, `log-stream.test.tsx:107`, `container-logs-view.test.tsx:190`, `container-detail-panel.test.tsx:273`, `swarm-panels.test.tsx:448` and bug-4's contract test `property-columns-contract.test.tsx:32,140-141,357,366`; e2e — `containers.spec.ts:687-703`, `container-logs.spec.ts:193-204`, `raw-console.spec.ts:265-278` and `image-detail-property-columns.spec.ts:263-266`. A test left asserting on a control that no longer exists, or softened until it passes on both builds, is refused in either direction. **The governing rule: coverage is removed only where the behaviour it covered is removed** — never neutered to make a run go green, and never carried along as decoration once what it served is gone, which is what the three clipboard permission grants become (REQ-5). |

## F8 — Nothing else changes

| ID | Requirement |
| --- | --- |
| REQ-31 | **The removal leaves the library and the feature code conforming.** Feature code emits no raw DOM tag and no CSS as a consequence of the change; no spacing, size, radius, colour, breakpoint or z-index is hard-coded outside the library; and **any layout adjustment the removal requires — the two action containers in particular — is made inside `client/src/ui/`**, never patched at a call site. |
| REQ-32 | **The blur allow-list is untouched.** No surface joins it, no blur value is written anywhere, and `client/scripts/check-ui-conformance.mjs` is **not modified** and passes — the removed control carried no style, token, blur or z-index of its own, so the conformance check needs no change and any edit to it is a signal that something else went wrong. |
| REQ-33 | **Keyboard and assistive-technology operation does not regress.** Tab order shortens by exactly the removed controls and by nothing else; no value loses its association with its label; no focus is left pointing at a removed element; no surface is left with a focus trap, an empty labelled group or an action group announced with no members. No control anywhere was reachable only by tabbing past a copy control, so no keyboard route is lost — and that must remain true after the change. |
| REQ-34 | **Nothing outside the client's copy affordance is touched.** No server file in the diff; no change to any Docker operation, to inspect, to digest shortening, to formatting, to caching or to any server response; no change to what the daemon returns or how it is transferred. **bug-1's progress dialog, bug-2's route into the filesystem browser, bug-3's interior layout of it, and bug-4's column rule, property set, ordering and content classes are delivered, certified and undisturbed** — bug-3's entry-metadata pane, which holds one of the removed controls, comes out otherwise visually unchanged. |
| REQ-35 | **Verified against the real daemon, under the project's test discipline**: own fixtures carrying the ownership labels, full cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, no inherited application state, its own data directory, no test reaching Docker Hub, and **every spec passing on its own**. Checks that cannot run on a daemon that is not a swarm manager skip with their reason stated rather than being quietly dropped. English only, kebab-case for any new file or folder name. |

## Appended on 2026-08-31 — the raw-console check bets against the console's contract

> Appended after the check at `client/e2e/copy-affordance-absence.spec.ts:725` — *"raw console: no
> transcript entry offers a copy, and every one keeps its Re-run and its status"* — went red again.
> `expect(entries).toHaveCount(2)` receives 1, times out at 30 s and takes the test's budget with it.
>
> **The check types two commands one after the other and never waits for the first:**
>
> ```ts
> for (const suffix of ['first', 'second']) {
>   await prompt.fill(`docker ps --filter label=${marker}-${suffix}`);
>   await prompt.press('Enter');
> }
> ```
>
> **The product declares that second submission inert.**
> `.sdd/modules/ui-library/specs/console-surface.md:58` — "`Enter` in the prompt → calls `onSubmit`;
> **does nothing when `busy`** or when the value is blank". The same section states what the operator
> sees meanwhile: the running entry shows a pending indicator and a `Cancel` control appears. The
> typed text stays in the prompt and is not lost.
>
> So the product does what its certified contract says, and the check expects the opposite. On an idle
> machine the first `docker ps` finishes before the second `Enter` arrives, and the check passes. When
> the whole file runs the daemon is loaded, the first command is still running, and the second
> submission is ignored — by design.
>
> **The evidence was already on file**:
> `.sdd/tech-debt/entries/raw-console-second-entry-order-dependent.md` — passes 2 of 2 when the case
> runs alone, fails 2 of 2 when the whole file runs, seen in two consecutive full passes on
> 2026-08-28. The failure snapshot shows the first entry complete (`exit 0`, `Re-run`) and the second
> command's text sitting on the prompt line. That entry asked for which of the two was at fault to be
> established before anything was decided. It is established, and it is the check.
>
> Per [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing
> above this line was changed**, beyond the one row added to the batch table in `batches.md` and its
> coverage rows. The certified batch is not reopened.

## F9 — The raw-console check drives the console by its contract

| ID | Requirement |
| --- | --- |
| REQ-36 | **The check sends its second command only after the first command's entry carries its final status.** It types into the prompt and presses `Enter` only while the console is not busy, so every command it sends is accepted. |
| REQ-37 | **Nothing the check verifies changes.** It still asserts over **every** entry of the transcript, and over **more than one** entry, that no entry offers a copy control, that each keeps its `Re-run` and its status badge, and that no clipboard write is observed on the raw console screen. Absence is still read from what an entry's action group holds, never from the word `Copy` — the defect it was written for is that a check on the first entry alone says nothing about the others. |
| REQ-38 | **The check passes when it runs alone and when its whole file runs, on every run of both.** It gets there with no retry, no softened assertion, no widened budget and no fixed delay. Waiting for the first command's own result is none of those: it is the precondition the product's contract states, and the check is deterministic with it and a race without it. |
| REQ-39 | **The corrected check still fails if a copy affordance returns to a transcript entry.** A repair that makes the check green by making it blind is refused. |
| REQ-40 | **No check in `client/e2e` or `client/test` submits a command to the console while another command is running.** The two trees are read for the same bet, and what is found is reported. |
| REQ-41 | **`raw-console-second-entry-order-dependent` leaves the technical-debt register**: the entry file and its row in `.sdd/tech-debt/index.md` go, and the register's own text stops counting and naming it. No other entry moves. The register holds what is still open — the human's decision of 2026-08-29, written at the top of the register itself. |
| REQ-42 | **The batch changes no product source.** Nothing under `client/src` or `server/src` moves, and no component spec and no module index changes. The console keeps ignoring `Enter` while it is busy, which is the behaviour this batch was written to respect. |
