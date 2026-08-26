---
slug: docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor
date: 2026-08-26
spec: .sdd/analysis/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor.md
status: validated
---

# Requirements — The seven tabs of the container detail, recomposed for the surface they now live on

Evolution of
[`plan-docker_management_app-containers_card_view-detail_modal`](../plan-docker_management_app-containers_card_view-detail_modal/requirements.md),
which moved the detail onto the large modal **with its content unchanged**. That constraint —
`plan-docker_management_app-containers_card_view-detail_modal/REQ-4`, content parity — is the one
this plan **supersedes**, and the only one. Every other requirement of that plan, and of
[`dialog_sizing`](../plan-docker_management_app-dialog_sizing/requirements.md),
[`container_detail_close`](../plan-docker_management_app-container_detail_close/requirements.md) and
[`detail_property_columns`](../plan-docker_management_app-detail_property_columns/requirements.md),
stands and is preserved by name in the cross-cutting section below.

Ids are local to this plan: `REQ-1` here is **not**
`plan-docker_management_app-containers_card_view-detail_modal/REQ-1`. Requirements of other plans are
always cited with their path prefix — which matters here more than usual, because the predecessor's
`REQ-25` (the health-check switch) is named repeatedly and this plan has a `REQ-25` of its own.

**Ten sections, nine of them a change point of the mock's summary table** — F0, F1, F1b, F2, F3, F4,
F5, F6, F6b — and a tenth holding what every one of them must not break. The nine fail
independently; the tenth is a standing condition on all of them.

**The mock is authoritative on composition and not on material.** Where a requirement below says a
value is "distinguished", "in the danger tone" or "accented", it fixes the *role*; the colour, radius
and shadow behind that role are the ones the application already implements, referenced by name from
the library's tokens. No figure written in the mock is a requirement: `min(78vh, 860px)`, the `%CPU`
threshold and the log-level thresholds are proposals, and the figures are set in the later phases.

## Values and readings fixed in these requirements, and why

No placeholder is left below. The points the spec and the mock leave open are decided here. **Four of
them were put to the human on 2026-08-26, at the requirements validation, and answered** — each with
the default this plan proposed, so the reading below is the human's and not only the planner's:

- **The recreation warning is stated for the whole time the form is in editing** (REQ-25), the mock's
  literal reading: it says what *would* require a recreation, before the operator has decided. It is
  not conditional on Environment or Mounts having been touched.
- **A container that has ceased to exist freezes the header** (REQ-6 … REQ-9). The identity keeps its
  last known values and the body goes on carrying the stated end state exactly as certified by
  `plan-docker_management_app-containers_card_view-detail_modal/REQ-33`; that behaviour is not
  changed by this plan.
- **Each sparkline is the series whose colour the mock strokes it in** (REQ-15, REQ-16): inbound for
  Net I/O, read for Block I/O, the count for PIDs. Not the two summed.
- **Nine batches, one per change point**, F0 first as a hard dependency; the two small points stay
  batches of their own.

The rest were decided by the planner, from the spec and the mock:

- **F0 fixes a property, not a number** (REQ-1 … REQ-4). "One height for the whole detail" is
  observable as "the box does not move" and "the height is bounded by the viewport"; the constant
  behind it is the developer's, per the mock's own closing note.
- **REQ-2 restores what the predecessor's `REQ-25` gave up.** That requirement was narrowed on
  2026-08-26 from "leaves the modal's viewport box unchanged" to "is not dragged", because a
  content-sized centred dialog necessarily grows and rises when fields are revealed. With a stable
  height that reason is gone, so this plan asks for the unchanged box the narrowing withdrew. The
  predecessor requirement is not reopened; it is satisfied more strictly than it demands.
- **The header follows the container without asking anything new of the daemon** (REQ-9). The modal
  is already bound to its container and already sees the list's re-reads
  (`plan-docker_management_app-containers_card_view-detail_modal/REQ-32`); the header renders what is
  already there. A state that changes therefore shows, and no request, endpoint or cadence is added.
- **Block I/O is treated exactly as Net I/O** (REQ-17). The spec's summary names only Net I/O, the
  mock draws both cards the same way — two labelled, distinguished values instead of one `a / b`
  string — and the mock is authoritative on composition.
- **Port mappings and Mounts get a container each, like the other groups** (REQ-23). The mock draws
  Runtime, Health check and Environment and stops; F4's finding is "no group has a container", which
  is about all of them, and leaving two groups on the continuous ground would be a third treatment
  nobody asked for.

## F0 — One height for the whole detail, and the tab's content scrolls inside it

| ID | Requirement |
| --- | --- |
| REQ-1 | The container detail dialog's viewport box — top edge, bottom edge and height — is the same before and after a change of tab, for any pair of tabs and whatever either holds. |
| REQ-2 | The dialog's viewport box is the same before and after a reveal inside a tab: operating the Config health-check switch, which today grows the dialog 85.2px and lifts its top edge 42.6px, moves no edge of it. |
| REQ-3 | A tab whose content is taller than the available height scrolls that content **inside** the dialog: the header and the tab bar stay put, every tab stays reachable, nothing is rendered outside the card, and no scrollbar appears on the page behind it. |
| REQ-4 | The detail's height is bounded by the viewport on every viewport: the card fits inside it with the delivered dialog margin, and no part of it falls outside. |
| REQ-5 | The stable height is an opt-in of the shared dialog surface. A dialog that does not ask for it is still sized by its content: the image diff, the layer explorer, the layer efficiency and the filesystem browser dialogs render at exactly the box they render at today. |

## F1 — The header carries the container's identity

| ID | Requirement |
| --- | --- |
| REQ-6 | The dialog's header shows the container's status dot, its name, and its state as a pill. The `Container — ` prefix is gone: the name stands alone. |
| REQ-7 | A container that has a health check shows its health outcome as a pill in the header; a container that has none shows no health pill, and nothing occupies the space where it would be. |
| REQ-8 | The header shows the container's short id. |
| REQ-9 | The header's values are read from the container data the detail already holds: a state or health outcome that changes while the detail is open shows there without the operator acting, and no request, endpoint or sampling cadence is added to make it so. |
| REQ-10 | No other dialog's header changes: every other dialog in the product draws the title it draws today, in the same place, with its close control unchanged. |

## F1b — Config is the first tab and the one active on open

| ID | Requirement |
| --- | --- |
| REQ-11 | Config is the first tab of the bar **and** the tab active when the detail opens; the tab drawn first and the tab opened on are the same one. The others follow it in the order Logs, Stats, Processes, Inspect, Exec, Attach. |
| REQ-12 | Every tab presented carries the same treatment, with only the active one distinguished. On a running container Exec and Attach are drawn exactly like the other five: nothing marks them as lesser. |

## F2 — Stats is two metrics with a ceiling, then three without

| ID | Requirement |
| --- | --- |
| REQ-13 | Stats is arranged as two groups instead of five equal tiles on one row: CPU and Memory on a row of two, then Net I/O, Block I/O and PIDs on a row of three. |
| REQ-14 | CPU and Memory each keep a meter, filled in proportion to the ceiling each of them has. |
| REQ-15 | Net I/O, Block I/O and PIDs carry no meter at all — no bar, and no "no measurable maximum" state of one — and each carries a sparkline of its recent samples instead. |
| REQ-16 | A sparkline draws a filled area beneath its line and marks its final point, so the current value is findable without reading the line. |
| REQ-17 | Net I/O shows its inbound and its outbound value as two separately labelled and visually distinguished values, and Block I/O its read and its write value likewise; neither is one `a / b` string in which the two differ only by position. |

## F3 — Config in reading

| ID | Requirement |
| --- | --- |
| REQ-18 | Environment variables are shown as key and value on two aligned tracks — the keys forming one column and the values another — instead of the raw `KEY=value` string the daemon returned. |
| REQ-19 | The environment section carries its own heading with the number of variables it holds. |
| REQ-20 | Mounts form a section of their own, with its own heading and its own count; the literal `mount:` prefix is gone from every entry. |
| REQ-21 | Each mount shows its source, its destination and a `ro` / `rw` chip, the read-only one distinguished from the read-write one, instead of two letters in brackets at the end of a string. |
| REQ-22 | `Edit configuration` sits at the head of the Config tab, above both columns and belonging to neither, rather than at the foot of one of them. |

## F4 — Config in editing

| ID | Requirement |
| --- | --- |
| REQ-23 | Each group of the edit form sits inside its own container instead of being a heading on a continuous ground: Runtime, Health check, Environment variables, Port mappings and Mounts each have one. |
| REQ-24 | The two small groups — Runtime and Health check — sit side by side rather than stacked one under the other. |
| REQ-25 | While the operator is editing, the form's footer states that Environment and Mounts changes require the container to be recreated — before the operator has decided, not after. |
| REQ-26 | The existing post-save confirmation is unchanged: saving a change that recreates the container still asks the operator to confirm explicitly before the container is stopped, removed and recreated, and refusing there still abandons the save. |

## F5 — The log controls in two groups, and the lines distinguished

| ID | Requirement |
| --- | --- |
| REQ-27 | The log controls form two labelled groups: `Fetch`, holding those that change **what is asked of the daemon** and reopen the stream — streams, tail size, since/until — and `Read`, holding those that change **only how it is read** — search, timestamps, download. |
| REQ-28 | The two groups wrap as whole blocks: at every width the line break falls between them, never inside one, and no control is separated from the group it belongs to. |
| REQ-29 | A log line is distinguished by the level deduced from its text, and the deduction is conservative: a line carrying no recognised level marker keeps the neutral treatment rather than being guessed at. |
| REQ-30 | A line coming from stderr is distinguished from a line coming from stdout. |
| REQ-31 | Whatever distinction is applied, the line's own text is shown exactly as it arrived and stays readable, and the search highlight still marks its matches over it. |

## F6 — The process table takes the height it is offered

| ID | Requirement |
| --- | --- |
| REQ-32 | The process table takes the height its tab offers instead of the fixed 320px inherited from the inline panel: with the dialog at its stable height, the rows occupy what is left under the tab's own header row, and no band of empty surface stands beneath the table. |
| REQ-33 | A `%CPU` value above a threshold is distinguished from the others in its column, so the consuming process is found without reading every row. |

## F6b — Inspect grouped, and a bad exit code that reads as one

| ID | Requirement |
| --- | --- |
| REQ-34 | Inspect's flat property list is grouped under two labelled groups — `Identity`, what the container is, and `Lifecycle`, how it has gone — instead of ten rows presented as one list. |
| REQ-35 | `State` reads as a pill, not as a word among the other values. |
| REQ-36 | A non-zero exit code reads as bad news, in the application's danger tone; a zero exit code carries no such tone. |
| REQ-37 | The raw payload is a collapsible section like the others of the tab, and is collapsed when the tab opens, instead of being the one section always open. |

## Cross-cutting — what none of the nine may break

These hold at the end of **every** batch of this plan, and are fully closed only when the last of
them lands.

| ID | Requirement |
| --- | --- |
| REQ-38 | Nothing under `client/src/` outside `client/src/ui/` acquires a raw DOM tag, a `.css` file, a CSS module, an inline `style` prop, a `className` carrying visual utilities, or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index. Every value behind a role the mock assigns is taken by name from the library's tokens, and none is copied from the mock's own `:root` block. |
| REQ-39 | No surface joins the blur allow-list and none leaves it: no new blurring selector, no blur value other than the single token, no new `ui-blur-exception:` comment — and the log stream's jump-to-live control still blurs the lines beneath it while the Logs tab is shown inside the dialog. |
| REQ-40 | At 375×812 the detail stays usable: every tab reachable, no value clipped to nothing, the terminal and the log views operable, and nothing requiring horizontal scrolling. |
| REQ-41 | The detail's data, operations, confirmations and live behaviour are unchanged: no new capability, no tab added or removed, no new or changed endpoint or payload, and no change to the sampling cadence or to its liveness gate. |
| REQ-42 | The certified behaviours of the detail survive the recomposition and are named in the checks rather than assumed: the modal's close control, the return of the point of interaction to the control that opened it by every dismissal route, the ending of every stream and session on dismissal, and the stated end state when the container ceases to exist. |
| REQ-43 | Every check invalidated by this recomposition is rewritten against the new composition rather than deleted — those that name a tab by position, that read the modal's title string, that assert the process table's fixed height, or that read the environment and mount entries in their present string form — and none is weakened into passing while what it named goes unchecked. |
| REQ-44 | Every interaction of this change is driven with a real pointer at the visible control's own coordinates — never an element's own `click()`, never a dispatched event, never aimed at a visually hidden input — and the checks assert geometry: the dialog's viewport box before and after a tab change and across the health-check reveal. Content assertions stand beside those, never instead of them. |
| REQ-45 | The checks run against the real daemon under the project's test discipline: own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, nothing assumed of the daemon's contents or of application state inherited from another test, and every spec passing when it is run on its own. |
