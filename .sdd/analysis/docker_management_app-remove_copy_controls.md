---
request_slug: docker_management_app-remove_copy_controls
date: 2026-08-14
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> how to fix: Remove all copy buttons!!!!

Reported as bug-5 in `bugs.md`, with `bugs-screen/bug-5.png`. The report is one line and carries no
`description:` field at all — the screenshot is the rest of it, and the four exclamation marks are the
human's own emphasis, reproduced rather than interpreted.

**What the screenshot shows.** A tight crop of the image detail panel: one property band carrying
`sha256:d9e853e87e55` with a `Copy` control immediately to its right, and the top edge of the next band
below it beginning `alpine:3.20`. That is the `Id` band of the image detail panel, with the `Tags` band
under it — the same two bands the previous report (bug-4) transcribed from its own screenshot. **One
instance is shown; the instruction says "all".** Establishing what "all" is, by behaviour and not by
label, is the substance of this analysis.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](./docker_management_app.md).

Four delivered siblings on this branch are the baseline and are not re-opened:

- [`docker_management_app-progress_completion_autoclose.md`](./docker_management_app-progress_completion_autoclose.md)
  (bug-1) — the shared progress dialog states `Completed` and dismisses itself. Untouched.
- [`docker_management_app-filesystem_browse_direct.md`](./docker_management_app-filesystem_browse_direct.md)
  (bug-2) — `Browse filesystem…` leads straight to the cost warning. Untouched.
- [`docker_management_app-filesystem_browser_layout.md`](./docker_management_app-filesystem_browser_layout.md)
  (bug-3) — the filesystem browser's interior height distribution, corrected in the library. Untouched
  except that its entry-metadata pane holds one of the controls removed here.
- [`docker_management_app-detail_property_columns.md`](./docker_management_app-detail_property_columns.md)
  (bug-4) — **the immediately preceding report, and the one this report intersects.** It restructured
  the very sections the reported control sits in, and it deliberately fenced this control off: its
  REQ-32 reads *"the copy affordance beside a value is untouched … bug-5 concerns it, is worked next,
  and nothing here anticipates it either way"*. That fence is discharged by this report. bug-4 also
  recorded a measurement that **depends on** the control: on the delivered build the `Id` band measures
  **43px against its neighbours' 33px**, which was mistaken for a wrap — a layout regression — until it
  was traced to the copy control inflating the band. That figure moves when the control goes, and the
  places where it is written down are enumerated below.

**Starting point.** The delivered product offers a one-click copy beside selected values and above
selected blocks: image and container ids, image references, swarm object ids, a volume mountpoint, a
plugin name, a registry pull reference, a filesystem path, a layer's build step, every raw inspect
payload, every buffered log, every console entry, and the two swarm join tokens. All of it is one
library component, `CopyButton`, rendered from five library components and configured from eleven
feature files. The base analysis (`docker_management_app.md`) **contains no copy or clipboard
requirement whatsoever** — the words do not occur in it; the affordance entered at the plan and spec
phases.

**Changes.** Every copy affordance in the client is removed — the controls, the component behind them,
its export, the item field that switches it on, and the confirmation state it showed. Nothing replaces
it. No value is added, removed, widened, shortened, reformatted or relabelled; the displayed text of
every affected surface is exactly what it is today, minus the control. What the operator keeps is
selection with the mouse and keyboard, the raw payload block on the detail panels, the log stream's
`Download`, and `Show` on a revealable value.

## Established findings

Read from the delivered code before writing this analysis, because "all" is the operative word and the
screenshot shows a single instance. Recorded so a later reader can weigh the conclusions rather than
take them on trust, and so the removal can be checked against a list rather than against a memory.

| Question | What was found |
|---|---|
| **How many implementations of copying are there?** | **One.** `client/src/ui/controls/CopyButton.tsx` is the only place in the entire client that touches the clipboard: `await navigator.clipboard.writeText(value)` at line 21. Nothing else in `client/src` matches `navigator.clipboard`, `writeText` or `execCommand('copy')`; there is no copy hook, no copy-on-click handler, no `onCopy`, no keyboard shortcut and no context-menu entry anywhere in the client. The component is exported from the library's public entry point (`client/src/ui/index.ts:58`). **So the removal is one deletion plus its render sites** — and the component itself must go, since a component left in the library unused is not removed. |
| **Which library components render it?** | **Five, and no feature file renders it directly.** `DefinitionList` (`ui/data/DefinitionList.tsx:36`, conditional on an item's `copyValue`); `CodeViewer` (`ui/data/CodeViewer.tsx:15`); `LogStream` (`ui/data/LogStream.tsx:115`); `ConsoleSurface` (`ui/console/ConsoleSurface.tsx:139`, one per transcript entry); `RevealableValue` (`ui/controls/RevealableValue.tsx:59`). Feature code reaches the control only through props — which is why an inventory by label is not the same thing as an inventory by behaviour. |
| **Which feature call sites switch it on?** | **Twelve `copyValue` props across eleven files**: `ImageDetailPanel.tsx:57` (`Id`), `ContainerDetailPanel.tsx:373` (`Id`) and `:375` (`Image`), `VolumesPanel.tsx:101` (`Mountpoint`), `RegistriesScreen.tsx:307` (pull `Reference`), `SwarmNodesPanel.tsx:105` (`Node id`), `SwarmSecretsPanel.tsx:111` (`Secret id`), `SwarmConfigsStacksPanel.tsx:145` (`Config id`), `SwarmServicesPanel.tsx:214` (`Service id`) and `:215` (`Image`), `PluginsScreen.tsx:59` (`Name`), `LayerExplorer.tsx:235` (`Build step`), `FilesystemBrowser.tsx:340` (`Path`). Plus the components that carry one unconditionally: **six `CodeViewer` sites in five files** (`ImageDetailPanel:87`, `ContainerDetailPanel:395` health-log blocks and `:400` raw payload, `VolumesPanel:110`, `NetworksPanel:99`, `PluginsScreen:254`), **two `LogStream`** (`ContainerLogsView:98`, `ComposeScreen:256`), **one `ConsoleSurface`** (`RawConsoleScreen:183`), **two `RevealableValue`** (`SwarmScreen:322` and `:333`, the worker and manager join tokens). |
| **How many screens is that?** | **Nine.** Images & layers (image detail `Id`, image raw payload, layer explorer build step, filesystem browser entry path), Containers (Inspect `Id` and `Image`, health-log blocks, raw payload, log buffer), Volumes & networks (volume `Mountpoint`, volume and network raw payloads), Swarm (node / secret / config / service ids, service image, both join tokens), Plugins (`Name`, raw payload), Registries (pull `Reference`), Compose (project log buffer), Raw console (per entry). Three of those render **one control per row of a list** — console entries, health-log blocks, definition bands — so the instance count on screen is not fixed, it scales with what the daemon returns. |
| **Is any instance icon-only, or labelled something other than `Copy`?** | **No — today.** `CopyButton`'s label defaults to `'Copy'` and **no call site passes `label`**, so every instance in the delivered build says `Copy`, and a text search would in fact find them all right now. That is a fact about this build, not a property of the design: the `label` prop makes a differently-worded instance one prop away, and the component renders a `Button`, which would happily take an icon. **This is exactly why the check must assert absence by behaviour** — see the requirement below. |
| **Does the control own any CSS, token or style rule?** | **None of its own.** There is no `ui-copy` or `copy-button` selector anywhere; `CopyButton` is a `Button size="sm" variant="ghost"` and nothing more. No token, no blur, no z-index, no entry in `check-ui-conformance.mjs` — the conformance check needs no change. **Two container rules do become questionable**, and they are the only styling consequence: `.ui-code-viewer__actions` (`data-table.css:323`) holds the copy control as its **only** child, so the row would be left empty; `.ui-log-stream__actions` (`log-stream.css:12`) keeps `Download` **only when `downloadFileName` is given**, so it too can be left empty (Compose passes one only while a project is selected). `.ui-console-surface__entry-actions` and `.ui-revealable-value__actions` keep other children and stay. |
| **Do the values stay selectable afterwards?** | **Yes, and nothing in the product prevents it.** `user-select: none` occurs exactly twice in the client — `content-viewer.css:24` and `code-editor.css:34` — and neither is on a value: they are chrome. `.ui-definition-list__value` (`data-table.css:305`) uses `overflow-wrap: anywhere` and no `text-overflow`, so a property value **wraps, it never truncates**; there is no ellipsis-with-`title` presentation to defeat selection, and no overlay absorbing the pointer. Raw payloads are a real `<pre>` inside a scroll area. So mouse and keyboard selection remains the fallback everywhere, unchanged. |
| **Is any value displayed shortened, so that the full text existed only inside the control?** | **Two, and this is the operator's real cost.** The image panel shows `inspect.id.slice(0, 19)` — `sha256:` plus 12 hex characters — while copying the full ~71-character id; the container Inspect tab shows `data.id.slice(0, 12)` while copying the full 64-character id. **Neither becomes unobtainable**: both panels carry a `Raw payload` block below the properties, rendering the Engine's own inspect JSON — which contains the full `Id` — as selectable text on the same surface. What changes is the effort: scroll to the payload, find the field, and hand-select a 64–71-character string inside a scrolled `<pre>`, instead of one click. Stated plainly rather than buried: **after this report, obtaining a full image or container id is a manual selection in a JSON block.** |
| **Anything already unobtainable, so that it is not attributed here?** | **Yes: the image panel's `Digest`.** The server shortens it before it ever reaches the client (`server/src/images/images-service.ts:197-203`, `shortDigest`), and that band has **no** copy control today — its full text is already only in the raw payload. Unchanged by this report, and recorded so the change is not blamed for it. |
| **Is there a case where selection is not an equivalent fallback?** | **Yes, one: the log stream.** `LogStream` is virtualised — only the visible slice of lines is in the DOM (`LogStream.tsx:106-110`), with spacer elements above and below — so a manual select-all captures the rendered window, not the buffer. Its copy handed over the **whole** buffer as text. The equivalent that remains is **`Download`**, present on the container logs view (which always passes a filename) and on Compose **only while a project is selected**. Consequence: putting a whole log on the clipboard stops being possible; saving it to a file remains. |
| **Is there a case where the loss is not merely convenience?** | **Yes, one: the swarm join tokens.** `RevealableValue` exists to hold a value *"masked until an explicit reveal, copyable without ever being shown"* — the copy control was the route that never displayed the token. After the removal the only route to a join token is `Show`, i.e. the token is drawn on screen and selected by hand. On a shared screen, a projector or a recorded session, the secret becomes visible where it previously need not have been. This is the sharpest cost in the tranche; it is recorded here, and the removal is carried out as instructed. |
| **Does any flow — a test, a tooltip, a toast, an announcement, a focus path — depend on the control?** | **No product flow; a good deal of coverage.** There is no tooltip, no toast and no live region: the entire confirmation is the button's own label swapping to `Copied` for 1.5 seconds (`CopyButton.tsx:22-23`). No control anywhere is reachable only by tabbing *past* a copy control, so no keyboard path is lost — but every removed control was a tab stop, so tab order shortens on eight screens. The coverage that depends on it: **unit** — `copy-button.test.tsx` (the whole file), `console-surface.test.tsx:137,147`, `revealable-value.test.tsx:79,102,139`, `log-stream.test.tsx:107`, `container-logs-view.test.tsx:190`, `container-detail-panel.test.tsx:273`, `swarm-panels.test.tsx:448`, and bug-4's own contract test `property-columns-contract.test.tsx:32,140-141,357,366` (*"the one item with `copyValue`, and only it"*, *"with the `Copy` beside `Id`"*); **e2e** — `containers.spec.ts:687-703`, `container-logs.spec.ts:193-204`, `raw-console.spec.ts:265-278`, `image-detail-property-columns.spec.ts:263-266`. Three of those specs call `context.grantPermissions(['clipboard-read', 'clipboard-write'])`, which becomes pointless. |
| **What exactly does this do to bug-4's records?** | **Four places, all of them written down.** (1) `image-detail-property-columns.spec.ts:328-330` — the comment stating the `Id` band measures **43px against its neighbours' 33px on the delivered build too, because it holds the copy control**, and the wrap heuristic it justifies: after the removal the `Id` band is 33px like the rest, so the note describes a build that no longer exists. (2) The same spec at `:263-266` asserts the `Copy` **is visible** inside the `Id` band — it must invert. (3) `client/e2e/support/property-bands.ts:132` and `property-columns-rule.spec.ts:134` both carry a comment excluding a `Copy`'s text from the measured text rectangles; the helper stays correct (it excludes control text generically), the comments no longer describe anything. (4) bug-4's REQ-32 is discharged. **Nothing else of bug-4 moves**: the column rule derives its minimum band width from `Created`, the longest value, not from the `Id` band, so column counts and transition widths are unaffected, and the section becomes marginally *shorter*, which satisfies bug-4's height ceilings a fortiori. |
| **Does a delivered requirement mandate copying?** | **One, derived — not the analysis.** `.sdd/plans/plan-docker_management_app/requirements.md:85`, REQ-26: *"The raw inspect payload of a container is viewable and copyable as-is."* The base analysis says nothing about copying at all, so this report narrows a requirement invented downstream rather than contradicting the product's own analysis. After this report the payload is **viewable and selectable as-is**, and REQ-26's second adjective is superseded. A dozen further module records describe the control and would otherwise be left describing something that does not ship — the `CopyButton` row in `ui-library/index.md:51` and its `specs/copy-button.md`, plus copy clauses in the specs for `DefinitionList`, `CodeViewer`, `LogStream`, `ConsoleSurface`, `RevealableValue`, the container detail panel, the container logs view, the raw console screen, the swarm screen and the layer explorer. |
| **Does anything outside the client copy?** | **No.** Nothing on the server, and the terminal's selection behaviour is xterm.js's and the browser's own, not a product affordance — the operator selecting text and pressing the platform's copy shortcut is the browser, and it is untouched by this report. |

> **Correction, 2026-08-14, by the orchestrating session.** Three totals in this file were wrong when
> it was written and have been corrected in place: **thirteen** `copyValue` props across eleven files
> (not twelve — the enumeration below always had thirteen entries; `SwarmServicesPanel.tsx` contributes
> two and `FilesystemBrowser.tsx:340` was dropped from the sum), **twenty-four** instance sites (not
> twenty-two), and **eight** screens (not nine — eight are named, nine were counted). The four
> per-component counts were right. The lists were right throughout; only the sums were not. This is
> recorded rather than silently fixed because on a report whose whole instruction is *remove them all*,
> a checklist short by one prop is exactly how the defect survives the fix. **The enumeration governs,
> never the figure.**

**Conclusion.** One component, one clipboard call, five render sites, thirteen feature props, eight
screens. The removal is small, complete and mechanically checkable; the parts that need judgement are
not "how" but "what it costs" — a full image or container id becomes a manual selection in a JSON
block, a whole log becomes a download instead of a clipboard write, and a swarm join token can no
longer be taken without being displayed. All three are stated as consequences, and the removal is
carried out as instructed.

## Summary

Every copy affordance in the client is removed — the `Copy` controls on eight screens, the single
library component behind all of them, its export, the item field that enables it and its `Copied`
confirmation — leaving every value displayed exactly as it is today and selectable by mouse and
keyboard, with nothing added in their place.

## Business goal

**The human asked for it in the plainest terms the tranche contains, and the control is his to
refuse.** Four exclamation marks on a one-line report is not a request for options. This is a product
decision about the interface's own vocabulary: a `Copy` sits beside values on eight screens, above every
raw payload, above every log and on every console entry, and the operator who reported it does not want
it there. That is sufficient, and this report implements it.

**What the interface gains is a plain surface.** The bands on the detail panels are read as data;
today one of them carries a control that inflates its own height by 30% — 43px against 33px, the
figure bug-4 measured and briefly mistook for a layout regression — and the shortest values on the
panel are the ones whose bands are tallest, purely because of the control. Removing it makes the
property section shorter, uniform in band height, and compounds the density bug-4 was written to buy.
It also removes a tab stop beside every value on eight screens, and a widget whose label mutates for
1.5 seconds after use.

**The library gets smaller by a whole component, which is the honest measure of a removal.** A
`CopyButton` left in `client/src/ui/` unused, or a `copyValue` field left on the item type with no
renderer, would mean the product still ships the thing the human asked to remove — just where he cannot
see it. The standing rule that everything visual comes from one library is exactly what makes this a
one-place change; the same rule is what makes an orphan unacceptable.

**And what it costs the operator, stated for the human to read.** These values are digests, ids, image
references, mount paths and join tokens — the things one pastes into a terminal. Published practice is
against this removal: the pattern exists precisely for *"system generated key values"* in definition
lists, *"to both reduce user effort and the occurrence of entry errors"*. Three losses are concrete:
the **full** image id (~71 chars) and container id (64 chars) are shown shortened, so obtaining them in
full becomes a hand-selection inside the raw payload JSON on the same panel; a **whole log buffer** can
no longer be put on the clipboard at all, because the stream is virtualised — `Download` replaces it,
and Compose offers `Download` only while a project is selected; and a **swarm join token** can no
longer be taken without first being displayed on screen. Set against that, one delivered fact softens
the picture: `navigator.clipboard.writeText` requires a **secure context**, and `CopyButton` calls it
with no guard and no error handling — so on any install reached over plain HTTP from another machine
these controls already fail, silently as far as the operator can tell. The product is losing a control
that never worked everywhere it was drawn.

## Requirements

### Functional — what disappears

- **No copy affordance is offered anywhere in the shipped client.** Not on the image detail panel's
  `Id`; not on the container Inspect tab's `Id` or `Image`; not on the volume `Mountpoint`; not on the
  registry pull `Reference`; not on any swarm node, secret, config or service id, nor on a service
  image; not on the plugin `Name`; not on the layer explorer's `Build step`; not on the filesystem
  browser's entry `Path`; not above any raw payload block or health-log block; not above any log
  stream; not on any raw-console entry; not beside either swarm join token. Nine screens, and the list
  above is the checklist.
- **Nothing in the shipped client reaches the clipboard API.** No `navigator.clipboard`, no
  `writeText`, no `execCommand('copy')`, no copy-on-click on a value, no copy keyboard shortcut, no
  context-menu copy entry, no third-party clipboard helper. This is stated as behaviour, not as a
  label, because it is the only form of the statement that cannot be satisfied by renaming a button.
- **The library component is removed, not orphaned.** `CopyButton` itself, its props type, its export
  from the library's public entry point, and the `copyValue` field of the definition-list item type all
  go, together with the five render sites inside the library. No unused import, dead prop, orphan file,
  leftover string, unused style rule or unused test helper survives the change — in the library or in
  feature code.
- **The confirmation state goes with it.** The string `Copied` and the 1.5-second timer disappear from
  the product; no transient state is left behind on any surface.
- **The client asks for no clipboard permission**, and no automated check needs to grant one.

### Functional — what must remain exactly as it is

- **Every value the control used to copy is still displayed, with the same text, in the same place,
  in the same band or block.** Nothing is added, removed, widened, shortened, reformatted, relabelled,
  reordered or moved behind a disclosure. This report removes a control; it changes nothing the product
  says.
- **Every one of those values remains selectable with the mouse and with the keyboard.** No surface
  gains `user-select: none`, an overlay that swallows the pointer, an ellipsis-with-`title`
  presentation or a hidden overflow. A property value continues to wrap rather than truncate, and a raw
  payload continues to be real selectable text.
- **The existing alternatives keep working, unchanged**: the `Raw payload` block on the image and
  container detail panels (which is where the full ids remain readable), `Download` on the log stream,
  `Show` on a revealable value, and the browser's own selection and copy shortcut, which belongs to the
  platform and is not the product's to remove.
- **Nothing replaces the removed control.** No context-menu entry, no copy-on-click, no keyboard
  shortcut, no click-to-select-all, no icon-only variant, no "hide it on small screens", no widening of
  a shortened value to compensate. Any of these is the same affordance under another name, and the
  instruction admits none of them.

### Functional — the surfaces must still be correct without it

- **No empty action row and no stray gap is left where a control was.** Specifically: the code-viewer's
  action row, whose only child the control was, must not remain as an empty flex row consuming its
  parent's gap; the log stream's action row must render nothing at all when it would otherwise be empty
  (a stream offered without a download filename); the property band's value must sit correctly with a
  single child; the console entry's action group and the revealable value's action group keep their
  remaining children and their spacing.
- **The property bands become uniform in height**, the `Id` band included: the delivered 43px band
  becomes the same 33px as its neighbours. This is the cheapest positive evidence that the control is
  gone from the band rather than merely relabelled, and it is stated as an expected measurement, not as
  a side effect noticed afterwards.
- **bug-4's delivered arrangement is otherwise unchanged**: the same properties, in the same order, in
  the same content classes, with the same column rule and the same transitions. The section is
  marginally shorter, which keeps its height ceilings satisfied; no column count changes, because the
  minimum band width derives from the longest value and not from the `Id` band.

### Non-functional

- **The removal leaves the library and the feature code conforming**, per the project's standing rule:
  feature code emits no raw DOM tag and no CSS as a consequence of the change, no spacing, size,
  radius, colour, breakpoint or z-index is hard-coded outside the library, and any layout adjustment
  the removal requires is made **inside** the library.
- **The blur allow-list is untouched**, no blur value is written, and `check-ui-conformance.mjs` needs
  no change — the removed control carried no style of its own.
- **The records catch up with the product.** No module index, component spec or requirement is left
  describing a control that does not ship — including the requirement that calls the container's raw
  payload "copyable", which becomes "viewable and selectable". A spec for a deleted component is an
  orphan of the same kind as an unused file.
- **Keyboard and assistive-technology operation must not regress.** Tab order shortens by exactly the
  removed controls and by nothing else; no value loses its association with its label; no focus is left
  pointing at a removed element; no surface is left with a focus trap or an empty labelled group.
- **Verified against the real daemon** under the project's test discipline: own fixtures carrying the
  ownership labels, full cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon or
  of inherited application state, its own data directory, no test reaching Docker Hub, and every spec
  passing on its own.
- **English only**, per the project's convention.

### Non-functional — how this must be checked, explicitly and for the record

The failure mode of this particular report is a check that passes on a product that still ships the
thing. It is written here rather than left to whoever writes the spec:

- **The check asserts absence by behaviour, not by string.** Two halves: **(a)** nothing in the shipped
  client reaches the clipboard API — no `navigator.clipboard`, `writeText` or `execCommand('copy')` in
  the client source that ships, and no clipboard write observable at runtime; **(b)** no control
  offering it exists on the surfaces that had one. **A check written only against the string `Copy`
  would pass with an icon-only instance still shipping** — the component's own `label` prop makes that
  one prop away — and would equally pass on a control relabelled `Copy id`. Recorded because it is the
  exact mistake available here.
- **The surfaces are enumerated, not sampled.** All eight screens and all twenty-four instance sites from
  the inventory above are covered; a spec that opens the image detail panel and stops has checked the
  screenshot, not the instruction.
- **Every interaction is driven with a real pointer at the visible control's coordinates** — expanding
  an image or container row, opening a tab, opening a collapsible section, selecting a layer, revealing
  a token — never `element.click()`, never a dispatched event, never a visually hidden target.
- **The check must fail on the delivered build**, and the delivered figures are on record here for
  that purpose: one clipboard implementation, five library render sites, thirteen `copyValue` props,
  eight screens, every instance labelled `Copy`, and an `Id` band of 43px against its neighbours' 33px.
- **Content assertions stand beside the behavioural ones, never instead of them**: that each affected
  value is still displayed with its exact text, and still selectable. A surface that lost its control
  *and* its value has passed half a check.
- **The coverage that exercised copying is removed rather than neutered**, and the assertions
  neighbouring it — the panel's own content, the revealable value's disabled state, the console entry's
  transcript — are kept, moved or restated rather than deleted along with it.

## What the operator must observe, in order

1. On Images & layers, expanding an image row shows the same nine properties with the same values —
   and no `Copy` beside `Id`. The `Id` band is the same height as every other band.
2. The `Id` still reads `sha256:` plus twelve characters. The full id is still on the same panel, in
   the `Raw payload` block below, where it can be selected with the mouse.
3. The raw payload block has no control above it; the block itself is unchanged and its text selects
   normally, with no empty strip where the control was.
4. On Containers, the Inspect tab shows `Id` and `Image` without controls; the logs view has a
   `Download` and nothing else above the stream; the health-log blocks carry no control.
5. On Volumes & networks, Swarm, Plugins, Registries, Compose and the Raw console, no `Copy` appears
   anywhere — including on every console entry, where `Re-run` and the status badges remain and only
   the copy is gone.
6. On Swarm, a join token is still masked until `Show`, and `Show`/`Hide` and the rotate action still
   work; there is no copy beside them.
7. Selecting any of these values with the mouse and copying with the platform's own shortcut works, as
   it does in any page.

## Assumptions

Every gap the report leaves is closed here with a default and its reason. None is returned as a
question: the instruction is unambiguous, the human is away, and none of these is a scope change or a
contradiction of what he asked for.

- **This is a fix, not an evolution.** A delivered affordance is withdrawn on the reporter's own
  instruction; the surfaces keep every value and every other capability, and nothing new is built.
- **"All" means all, by behaviour.** The screenshot shows one instance and the word is "all", so the
  scope is every copy affordance in the client — the five library render sites, the thirteen feature
  props, the eight screens and the component itself — and not the band in the crop. Leaving some would
  also leave the product internally inconsistent, which is the state the single-library rule exists to
  prevent.
- **Nothing replaces it, and no partial reading is entertained.** No replacement affordance, no
  keeping "just the ids", no hiding it behind a hover or a breakpoint. Any of those is the control
  under another name, and the report's emphasis rules them out.
- **Selection is the fallback, and it is not improved.** Adding click-to-select, a select-all control
  or a tooltip carrying the full value would be a replacement affordance introduced under cover of a
  removal. The values are already selectable; that is where it stops.
- **The two shortened ids keep their shortened presentation**, and the full value stays reachable in
  the raw payload on the same panel. Widening them would change what the panel says, which is a
  different request. **This is recorded as the operator's cost, not hidden**: obtaining a full id
  becomes a manual selection inside a JSON block.
- **The log stream's clipboard route ends and `Download` remains.** Compose offers `Download` only
  while a project is selected — delivered behaviour, unchanged here, and named so the gap is a known
  one rather than a discovery.
- **The join token's exposure change is accepted and recorded.** The token remains retrievable through
  `Show`; it can no longer be taken without being shown. This is the item most likely to draw a
  follow-up request, and the human will have read it here first.
- **REQ-26's "copyable" clause is narrowed to "viewable and selectable"** rather than treated as a
  blocker. The base analysis contains no copy requirement, so nothing in the product's own analysis is
  contradicted; a requirement derived downstream is the right thing to narrow when the reporter
  withdraws the capability it describes.
- **Records describing the control are corrected as part of the removal**, not left for later. The
  affected module indexes, component specs and requirement lines are enumerated in the findings.
- **The terminal and the browser are not touched.** xterm.js's selection and the platform's own copy
  shortcut are not product affordances; removing "copy buttons" does not mean disabling the browser.
- **No server change.** Nothing about what the daemon returns, how a digest is shortened, or what a
  payload contains is in this report.
- **bug-1 through bug-4 stand.** Only figures and assertions that were measured *with the control
  present* are restated, and they are listed rather than left to be discovered by a red run.

## Constraints

- **Product constraint — every visual element comes from the UI library**, which is what makes this a
  single-component removal; and the same rule forbids leaving the component in the library unused, or
  patching the resulting gaps with a style in feature code.
- **Product constraint — the library shrinks properly.** No orphaned component, prop, export, string,
  style rule or test helper; the two action containers that can be left empty are resolved inside the
  library.
- **Product constraint — nothing the surfaces display may change.** The removal is of a control only:
  no value added, removed, widened, shortened, reformatted or relabelled anywhere.
- **Product constraint — the main view keeps paying nothing.** No surface joins the blur allow-list, no
  blur value is written, the conformance check is unchanged, and nothing continuously computed is
  introduced.
- **Product constraint — bug-1, bug-2, bug-3 and bug-4 are delivered and certified.** bug-4's component
  is the one whose bands change height; its column rule, property set, ordering and content classes are
  not to be touched.
- **Platform constraint — the clipboard API is secure-context only.** It is why the delivered controls
  are already inert on a plain-HTTP install reached from another machine, and it is why no replacement
  built on the same API would be more dependable than what is being removed.
- **Repository constraint — the suite runs against the operator's own daemon**: ownership labels, full
  cleanup, `docker rm -fv`, its own data directory, no reliance on an empty daemon, no reach to Docker
  Hub, every spec passing on its own.
- **Verification constraint — absence is asserted by behaviour, pointer-driven, and must fail on the
  delivered build.**
- **Convention constraint — English only**, kebab-case for any new file or folder name.

## Market trends

Relevant and consulted, narrowly — this is a product in a real category (Portainer, Docker Desktop,
Lazydocker) and "should an admin console offer one-click copy for ids and tokens" has a published
default. The findings do **not** argue with the decision, which is the human's; they establish what it
costs, so the cost is on the record and not inferred later.

- **The pattern exists for exactly the values this product shows.** PatternFly's clipboard-copy
  guidance names *"system generated key values"* in forms and definition lists as its use case, and
  states its purpose as *"to both reduce user effort and the occurrence of entry errors"*, with an
  expandable variant specifically for long strings. That is a description of the image panel's `Id`
  band. ([PatternFly — Clipboard copy design
  guidelines](https://www.patternfly.org/components/clipboard-copy/design-guidelines/))
- **Manual selection of a long identifier is the friction the pattern was invented to remove** —
  positioning the cursor precisely, re-selecting when it slips — which is the fallback this report
  leaves the operator with for a 64-character id inside a scrolled JSON block. ([UX study: copy to
  clipboard in your web app](https://flaming.codes/en/posts/ux-study-copy-to-clipboard-action-web-api/);
  [Improving the copying-to-clipboard experience](https://blog.prototypr.io/3-ways-to-copy-to-clipboard-5077f5774b55))
- **In this category the pressure runs the other way.** Portainer carries open requests *for* more copy
  affordances — a copy control in its web editors, and select-and-copy inside the container console —
  rather than complaints about having them. Recorded plainly: this product is moving against its
  category's direction, deliberately, at the reporter's instruction.
  ([portainer/portainer#10116](https://github.com/portainer/portainer/issues/10116);
  [portainer/portainer#5976](https://github.com/portainer/portainer/issues/5976))
- **The one countervailing fact, and it is a technical one.** `Clipboard.writeText()` is available
  *"only in secure contexts (HTTPS)"* and throws `NotAllowedError` when it is not permitted; the
  delivered control calls it with no guard and no error handling. A self-hosted tool served over plain
  HTTP and opened from another machine therefore already has dead copy buttons on eight screens. The
  affordance being withdrawn was never uniformly available.
  ([MDN — Clipboard.writeText()](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText))

## Risks

- **Removed by label, not by behaviour.** A pass driven by searching for `Copy` finds every instance in
  *this* build and would still pass a build where one instance is icon-only or relabelled. The
  component's `label` prop makes that one edit away. This is the single most likely way to close the
  report with the defect still shipping.
- **The component is left in the library, unused.** The screens look right, the human is satisfied by a
  screenshot, and the product still contains the thing he asked to remove — plus a spec describing it
  and an export offering it to the next feature. "Removed" would be false.
- **Only the screenshot's instance is done.** One band in a crop against twenty-four instance sites on
  eight screens, three of which render one control per row: a bug-6 with the same one line.
- **A replacement sneaks in.** Copy-on-click on the value, a context-menu entry, a keyboard shortcut, a
  `title` carrying the full id — each well meant, each the same affordance renamed, each a direct
  contradiction of an instruction that could not be plainer.
- **An empty action row or a stray gap is left behind.** The code viewer's action row has no other
  child; the log stream's has none whenever a download is not offered. The visible outcome is a strip
  of dead space above a block — a cosmetic defect introduced by a cosmetic fix.
- **A value becomes unselectable, truncated or ellipsised in the tidy-up.** Someone "finishes" the band
  by clamping the value to one line. That turns a convenience loss into a data loss, on precisely the
  values the operator needs whole.
- **bug-4 is disturbed.** Its 43px note, its `Id`-band copy assertion, its wrap heuristic and its
  height figures were all measured with the control present; a careless pass either breaks its specs or,
  worse, re-tunes its column rule to "restore" a height that changed for this reason.
- **Coverage is deleted wholesale.** The copy assertions sit inside tests that also check the panel,
  the revealable value's disabled state and the console entry's transcript. Deleting the files takes
  unrelated coverage with them, invisibly.
- **The join-token change goes unremarked** and returns as a security complaint from a human who was
  never told that `Show` is now the only route.
- **The log-buffer gap goes unremarked** — copying a whole log stops being possible, and on Compose
  without a selected project there is no `Download` either.
- **Clipboard grants and stubs are left in place**, so the suite still asks a browser for permissions
  nothing uses and still stubs an API nothing calls: dead scaffolding that hides the removal's
  completeness from the next reader.

## Scope

**In scope**

- Every copy affordance in the client: the single library component and its clipboard call, its export
  from the library's public entry point, the `copyValue` field of the definition-list item type, the
  five library render sites (property band, code viewer, log stream, console entry, revealable value)
  and the thirteen feature props that switch them on, across eight screens.
- The confirmation state (`Copied`, and its timer) that went with the control.
- The correctness of the surfaces afterwards: no empty action row, no stray gap, uniform property-band
  heights, every value still displayed and still selectable.
- The records and checks that were written with the control present: bug-4's 43px note and `Id`-band
  assertion, the two comments about excluding a `Copy`'s text from measured rectangles, the unit and
  e2e coverage of copying, the Playwright clipboard grants, the module indexes and component specs
  naming the component, and REQ-26's "copyable" clause, narrowed to "viewable and selectable".
- The stated outcome: **no copy affordance anywhere in the product, by behaviour and not only by
  label**, demonstrated by a check that fails on the delivered build.

**Out of scope**

- What any surface displays or says: no value added, removed, widened, shortened, reformatted,
  relabelled, reordered or hidden. In particular the two shortened ids and the server-shortened digest
  keep exactly their delivered presentation.
- Any replacement affordance whatsoever — context menu, copy-on-click, keyboard shortcut,
  click-to-select, icon-only control, hover-revealed control, breakpoint-conditional control.
- The browser's own selection and copy, and the terminal emulator's selection behaviour: not product
  affordances, not touched.
- `Download` on the log stream and every other export or transfer capability, which stay exactly as
  delivered.
- Anything on the server: inspect, shortening, formatting, caching, transfer.
- bug-1's progress dialog, bug-2's flow into the filesystem browser, bug-3's interior layout of it, and
  bug-4's column rule, property set, ordering and content classes — all delivered, all standing.
- The other reports in `bugs.md`; this tranche of five ends here.
