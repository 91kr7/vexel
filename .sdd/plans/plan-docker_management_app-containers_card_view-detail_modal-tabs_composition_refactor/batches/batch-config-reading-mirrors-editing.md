---
batch: config-reading-mirrors-editing
feature: F3b — Config in reading is the edit form, read
closed_req: [REQ-46, REQ-47, REQ-48, REQ-49, REQ-50, REQ-51, REQ-52, REQ-53, REQ-54, REQ-55, REQ-56, REQ-57, REQ-59]
depends: [config-reading-layout, config-editing-cards]
amended: 2026-08-27, from the human's review of the first pass
---

# Batch — The reading of the Config tab becomes the form it edits, with the controls replaced by their values

A tenth batch, added on 2026-08-27 after the other nine were certified, from a UX review of the
delivered tab. It is a review of this plan's own work and not a change point of the mock: the mock
draws the **editing** composition (`batch-config-editing-cards`) and says nothing about the reading
one, so the reading was left as `batch-config-reading-layout` had rearranged it — correct in every
particular it was asked about, and a different screen from the form it opens.

**What the operator sees today.** Reading: two columns, a `Runtime configuration` list on the left
carrying restart policy, CPU, memory, one line of comma-joined port mappings, one line holding the
daemon's raw health-check test array, and networks; `Environment` and `Mounts` on the right. Editing:
five cards — `Runtime` and `Health check` side by side, then `Environment variables`, `Port mappings`
and `Mounts` at full width. Two settings change place between the two states and two change form, so
`Edit configuration` does not open the thing that was being read; it opens a rearrangement of it.

**This batch adds nothing to the library.** Every part of the reading arrangement is a component the
editing one already composes — `Card`, `SectionHeader`, `Grid arrangement="pair"` — plus the two the
reading already used, `DefinitionList` and `Chip`. The health check's "no probe" state is the
library's one placeholder, `EmptyState`, asked for `compact`.

**What must not be lost here.** F3's own five requirements, all of which survive the recomposition
and none of which this batch reopens: the environment on two aligned tracks under a counted heading
(REQ-18, REQ-19), the mounts as a counted section with the `ro` / `rw` chip and no `mount:` prefix
(REQ-20, REQ-21), and `Edit configuration` at the head of the tab belonging to neither column
(REQ-22). Also the certified column-count rule — a property section's column count follows the
**section's own** width and not the viewport's
(`plan-docker_management_app-detail_property_columns`, bug-4) — which this batch does not change but
does move the evidence for: `Environment` is a full-width group now rather than half of a split, so
the widths at which its count rises are different ones.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | The reading takes the editing arrangement: each group inside a `Card` of its own, `Runtime` and `Health check` in the `pair`, `Environment variables`, `Port mappings` and `Mounts` at full width beneath. The action stays at the head of the tab, above the pair and inside neither of its columns. | REQ-46 | — |
| INT-2 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | The health check becomes a group of its own: `enabled` / `disabled` in the heading's trailing slot, and under it either its command, interval, timeout, retries and start period — durations in seconds and the command without the `CMD` / `CMD-SHELL` token, as the form holds them — or the library's placeholder saying the container defines no probe. Its line leaves the runtime list. | REQ-47 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | Published ports become a counted group of their own, one entry per binding, the container's own port and protocol against the host port, with an unpublished binding saying so. The comma-joined line leaves the runtime list. | REQ-48 | INT-1 |
| INT-4 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | The three collection groups are drawn only when they hold something; `Runtime` and `Health check` are drawn always. | REQ-49 | INT-1, INT-2, INT-3 |
| INT-5 | modify | `client/test/unit/container-detail-panel.test.tsx`, `client/test/unit/property-columns-contract.test.tsx`, `client/e2e/container-detail-config-reading.spec.ts`, `client/e2e/container-detail-property-columns.spec.ts` | The checks that name the reading's groups by their former titles are rewritten against the new composition rather than deleted, and the rule each of them was written to protect is re-asserted on it. **One of them had become unfalsifiable and is repaired, not re-pointed**: the check that the `Environment` count follows the section's own width measured a two-variable fixture, which can never show more than two bands on a line whatever the width — so with the section at full width it reported "the count did not rise" for a fixture that had nothing left to put on the line. Its fixture is widened until the arrangement, and not the fixture, decides the count. | REQ-43, REQ-44, REQ-45 | INT-1, INT-2, INT-3, INT-4 |

### Second pass — the human's review of the first, 2026-08-27

The five interventions above were implemented and looked at. Three findings came back, one of which
is a defect in the server rather than in the tab. REQ-50 and REQ-51 amend REQ-22 and REQ-49; the
amendments are stated in `requirements.md` and are not edited into the requirements they replace.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-6 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | `Edit configuration` moves from the head of the tab to its foot, at the trailing edge, belonging to no group — the place the edit form's own save and cancel occupy. It scrolls with the tab's content, as that footer does. Its label and what it does are unchanged. | REQ-50 | INT-1 |
| INT-7 | modify | `client/src/containers/ContainerDetailPanel.tsx`, Config tab in view mode | The three collection groups are drawn whether or not they hold anything, each with its count — the editing arrangement exactly. A group with nothing in it says so in the library's placeholder rather than being absent. | REQ-51 | INT-4 |
| INT-8 | modify | `server/src/containers/containers-service.ts` | A port exposed without being published is carried by the inspect data. `HostConfig.PortBindings` arrives as an empty object rather than as absent, so `??` never falls through to `NetworkSettings.Ports` and the fallback written for this case is dead: the fall-through is made to happen on an empty map as well as on a missing one. Ports from either source are reported once, in the order the service already fixes. | REQ-52 | — |
| INT-9 | modify | `client/src/ui/glass/scroll-area.css` (and `ScrollArea.tsx` if the opt-in needs a prop) | The scrolled region leaves room for what it holds: a surface at its edge draws its whole drop shadow instead of having it clipped, and the scrollbar gets a gutter instead of sitting on the content's trailing edge. **The blast radius is the reason this is an intervention of its own**: eight call sites share this region — the log stream, the console, the data table, the tree view, the two content viewers, the code viewer and the event stream — and none of them may change box. If one inset cannot serve all nine, the region takes a named opt-in and the detail asks for it; a value written at the call site is refused (REQ-38). | REQ-53 | — |
| INT-10 | modify | `client/test/unit/container-detail-panel.test.tsx`, `client/e2e/container-detail-config-reading.spec.ts`, `server/test/` (the inspect coverage) | The checks that locate `Edit configuration` at the head of the tab, and those that assert a collection group is absent when empty, are rewritten against the foot and against the always-drawn groups. The exposed-but-unpublished port gets a check of its own, against a fixture that exposes a port without publishing it — the state that produced the report. Geometry is asserted, not only content: the action's box against the tab's trailing and bottom edges, and a surface's shadow against the scroller's own box. | REQ-43, REQ-44, REQ-45 | INT-6, INT-7, INT-8, INT-9 |

### Third pass — the human's review of the second, 2026-08-27

Three complaints on the arrangement of the three collection groups, and **one cause behind all
three**: `DefinitionList arrangement="key-columns"` gives the label a fixed track and starts every
value at one offset, which suits a column of short keys and suits nothing else. The measurements are
in `requirements.md` under REQ-54 … REQ-56.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-11 | modify | `client/src/ui/` (the primitive the reading uses) and `client/src/containers/ContainerDetailPanel.tsx` | Environment variables read one per row at the group's full width, key field and value field side by side as the edit form draws them, the value beginning at its own field and staying on one line where the row has room. **The library is extended first**: if `DefinitionList` cannot express "one entry per row, two proportional fields" it gains the arrangement or the primitive that can, with a typed public API and no Docker vocabulary; nothing is written at the call site. | REQ-54 | INT-7 |
| INT-12 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Each port entry names its container port and its host port, so the two numbers are told apart without inference. The group keeps flowing more than one entry per line. Where naming needs a shape the library does not have, the library gains it first. | REQ-55 | INT-7 |
| INT-13 | modify | `client/src/ui/` and `client/src/containers/ContainerDetailPanel.tsx` | A mount is given its row's real width: a volume source is not wrapped over four lines inside a 180px track with 942px empty beside it. Source, destination and the `ro`/`rw` chip stay the three parts they are (REQ-21). | REQ-56 | INT-11 |
| ~~INT-15~~ | — | — | ~~`Config.ExposedPorts` as a third source.~~ **Implemented and then withdrawn the same day**, see REQ-58. Reverted, not left dormant. | ~~REQ-58~~ | — |
| INT-16 | modify | `server/src/containers/containers-service.ts` | The inspect reading is the container's publications and only those. `Config.ExposedPorts` is dropped as a source and so is the `NetworkSettings.Ports` **supplement**, which existed to surface an exposed-only port; `HostConfig.PortBindings` states the set. `NetworkSettings.Ports` stays for one job it alone can do: **resolving the host port the daemon chose** where the operator named none, so a `-p 80` / `-P` publication states its real host port instead of reading `not published`. Resolution, never addition — it introduces no container port the bindings do not name, so a `-p 8080:8080` stays one entry and does not become the two its dual-stack record would make it. | REQ-59 | INT-8 |

**INT-16's mechanism was written wrong and corrected on evidence, 2026-08-27.** The intervention said
a `-P` publication "arrives as `{"80/tcp":[{"HostIp":"","HostPort":""}]}`" and could therefore be
served by resolution alone. Measured on Docker 29.7.2, it does not: `docker run -P` fills
`HostConfig.PortBindings` with `{}` and puts the whole publication in `NetworkSettings.Ports`
(`{"5000/tcp":[{"HostIp":"0.0.0.0","HostPort":"55500"}]}`). Under "resolution, never addition" such a
container would report no ports at all — a port genuinely published on the host, shown nowhere, which
is the exact opposite of REQ-59. So `NetworkSettings.Ports` is admitted as a **source** too,
restricted to entries carrying a real host port: an entry without one is an exposure, so nothing
merely declared can enter through it, and a container port already accounted for is never counted
twice, so a dual-stack record still collapses to the one publication it is. `-p 80` — the case the
intervention described accurately — remains pure resolution. The rule was implemented; the mechanism
the orchestrator guessed was not.
| INT-14 | modify | `client/src/ui/` (the reading primitive INT-11 added) | A field of an entry is capped at half the entry's width, in every arrangement. On the mounts the content-proportional share had put the source/destination boundary at a different offset per row, which is the "casino" the human reported: with the cap the rows line up again, and a source longer than half the row wraps rather than running past the middle. The cap is a share, not a length — no pixel value at the call site or in the component. | REQ-57 | INT-13 |

**Whatever INT-11 adds to the library serves INT-13 too, or the two are one change.** Three groups
crushed by one arrangement is not three bugs; a fix that repairs the environment and leaves the
mounts wrapping has misread the cause.

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in `inspect-grouped` and honoured here: this batch adds no blurring surface, no value
written at a call site, no raw tag and no CSS, changes no endpoint, payload or capability, and its
own checks assert the dialog's box across the interaction they drive.

## What this batch supersedes, deliberately and by name

**`plan-ui-coherence-optimisation/REQ-60` — a section with a count of `0` is absent, not present and
empty.** REQ-51 asks for the opposite on this tab, and the reversal is the human's, taken on
2026-08-27 on the evidence of their own daemon: a container exposing a port but publishing none
showed no `Port mappings` group at all, and "there is no published port" — which is an answer they
had come for — was indistinguishable from "this product does not show ports". The rule is not
weakened elsewhere: it stands for the Inspect tab's collapsible sections and for the image panel,
where a group is a disclosure the operator opens rather than a field they are looking for. What
changes is one tab, on the ground that its reading must be the form it edits, and the form draws all
five groups always.

## Decisions taken in this batch, and what was deliberately left alone

1. **The two paired cards still end at different heights, and the raggedness was left standing.**
   `.ui-grid--pair` declares `align-items: start`, written when the pair held bare property sections;
   since `config-editing-cards` it holds `Card`s, each drawing `--shadow-2` along its own bottom
   edge, so two cards of unequal height draw two shadows at two heights. The library already states
   the opposite rule for a row of cards — `.ui-grid--cards`, `align-items: stretch`, "every card of a
   row takes the height of the tallest". The same raggedness is visible on `System & prune`, which
   also puts cards in a `pair`, and in this tab's own edit form. **Put to the human on 2026-08-27 and
   left as it is**: it is the certified behaviour of two batches and of a third screen, and repairing
   it is a decision about the library rather than about this tab.
2. **The `EmptyState` inside the `Health check` card keeps its own frame.** It carries a border, a
   radius and a wash of its own, so inside a `Card` a second frame is visible, and its title is set
   at `font-size-lg` semibold against the eyebrow above it. Also put to the human on 2026-08-27 and
   kept: `EmptyState` is the library's single answer to "there is nothing to show here" and has no
   frameless variant, and inventing one for a single call site is what the library's own growth rule
   refuses.
3. **The tab's cards breathe 24px sideways and 16px downwards** — the `pair`'s `--space-6` against
   the enclosing column's `--space-4`. Recorded, not changed. It is not introduced here: the edit
   form has carried the same two rhythms since `config-editing-cards`, and putting the reading on the
   same composition put it on the same mismatch. Whoever settles it should settle both states at
   once.
4. **A port the daemon publishes nowhere reads `not published`** rather than as a blank value.
   ~~And an *exposed* port that is not published is not invented into this group: the group states
   bindings, which is what the edit form's rows create and what the daemon returns in `ports`.~~
   **Struck on 2026-08-27 by REQ-52.** The second half rested on a false premise — that `ports`
   simply does not carry an exposed-only port — when in fact the service was dropping it through a
   `??` that does not fall through on `{}`. The human found it on their own daemon: a container whose
   card advertises `5000` showed no ports at all in its detail. The group states what the container
   exposes, published or not.

### Carried out of this batch, deliberately, and not fixed here

Both found while implementing INT-8, both real, both outside what REQ-52 asks for. Written down so
the next reader does not have to rediscover them.

- **A host port the daemon chose (`-p 80`, `-P`) still reads `not published`.** `HostConfig.PortBindings`
  holds `{"80/tcp":[{"HostPort":""}]}` — non-empty, so the supplement never fires — while the card,
  reading the daemon's own list, shows the real host port. Making the two agree means letting
  `NetworkSettings.Ports` **override** a binding rather than supplement it, which changes what a
  stopped container reports against a running one. A requirement of its own, not a widening of this
  one.
- **At 375px an environment value is drawn on eight lines.** The two fields of an entry are an equal
  share each of a 295px region, so a value gets 87px and a `PATH` of 63 characters wraps eight times.
  Nothing is clipped and nothing scrolls sideways, so REQ-40 holds to the letter — and it is still
  not readable. The fix that suits this product is **not** a viewport breakpoint, which would
  contradict the rule that a count follows the box and never the window
  (`plan-docker_management_app-detail_property_columns`): it is for the fields of an entry to wrap
  against **each other** when the entry cannot carry them side by side — caption above value, one
  field per line. Put to the human on 2026-08-27 with the measurement; they approved the desktop
  arrangement and did not ask for it, so it stands recorded and unfixed.

- ~~**An exposed port vanishes from both of the daemon's port maps the moment the container publishes
  anything else, and REQ-52 does not reach it.**~~ **Closed by REQ-58 on 2026-08-27, and the reason
  this was ever "carried" is worth keeping.** It was recorded as a boundary rather than a defect on
  the argument that the card is no better informed, so the two readings agree and nothing
  contradicts. True, and beside the point the human made when they hit it on their own container:
  they had declared four ports and the tab showed three. Agreement between two incomplete readings
  is not the requirement; showing what the operator declared is. The original note follows.** Verified on Docker 29.7.2 with
  `run -d -p 18090:80 --expose 9000`: `HostConfig.PortBindings` holds `80/tcp` only,
  `NetworkSettings.Ports` holds `80/tcp` only (twice, once per IP stack — which is why the fix
  supplements rather than merges), and `9000/tcp` exists solely in `Config.ExposedPorts`, which is
  neither map. So such a container shows port 80 alone in the Config tab. **The card shows 80 alone
  too**, so the card-versus-detail divergence REQ-52 exists to close is closed; reading a third map
  would put the detail ahead of the card and open a new one. Widening it — in both readings at once —
  is a requirement of its own.

- **Editing the ports of a `-P` container would pin its ephemeral host port.** The edit form is
  seeded from `inspect.ports`, which since REQ-59 carries the number the daemon chose. Nothing
  changes while the operator leaves the ports alone — `buildCreatePayload` still reads
  `HostConfig.PortBindings` directly — but an operator who edits any port and saves recreates the
  container with that once-ephemeral port fixed. No requirement states this, and the alternatives
  are both refused here: withholding the number REQ-59 exists to show, or touching the create
  payload REQ-41 freezes. Raised by the developer, recorded, not acted on.

- **A recreate drops an exposed-but-unpublished port.** `buildCreatePayload` still seeds from
  `portsFromRaw(hostConfig.PortBindings)` when the operator edited no port, so the recreated
  container loses the `ExposedPorts` entry. Fixing it changes the create payload, which REQ-41
  forbids in this plan.

## Human acceptance

### Scenario: the setting the operator just read is where they left it

- REQ → REQ-46
- Given → a container's detail open on Config, in reading
- When → the operator notes where a setting is drawn, presses `Edit configuration`, and looks for it
  again
- Then → it is in the same group, in the same position on the tab, with the value they were reading
  now in a control

### Scenario: whether the container is watched is answered without opening the form

- REQ → REQ-47
- Given → one container that defines a health check and one that defines none
- When → the operator opens each detail on Config
- Then → the first shows a health-check group stating its command and its timings in seconds, the
  second a health-check group saying it defines no probe, and neither requires reading a raw array
  or pressing `Edit configuration` to find out

### Scenario: the published ports are a list and not a sentence

- REQ → REQ-48
- Given → a container publishing two ports
- When → the operator looks at the Config tab
- Then → the ports are a group headed with how many there are, one entry per binding, each naming the
  container's port and the host port it answers on

### Scenario: a container that states nothing is not a column of empty headings

- REQ → REQ-49
- Given → a container with no environment variable, no published port and no mount
- When → the operator opens its detail on Config
- Then → no heading counting `0` is drawn for any of the three, and the runtime and health-check
  groups are still there, saying what the container's restart policy is and that it defines no probe
