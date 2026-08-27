---
slug: docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload
date: 2026-08-27
spec: .sdd/analysis/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload.md
status: validated
---

# Requirements — The Inspect tab becomes the whole payload, and moves after Config

Evolution of
[`plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor`](../plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/requirements.md),
whose ten batches recomposed the seven tabs of the container detail modal. This plan supersedes
**two** of its requirements and the **order clause** of a third; everything else it certified stands
and is restated here as a standing condition (F8).

Ids are local to this plan: `REQ-1` here is **not** the predecessor's `REQ-1`. Requirements of other
plans are always cited with their path prefix.

## What this plan supersedes, by name

1. **`…-tabs_composition_refactor/REQ-34` — Inspect's ten properties grouped under `Identity` and
   `Lifecycle`.** The ten hand-picked fields are exactly the gap this plan closes: the grouping goes
   with them, replaced by sections derived from the payload itself (F4). The ten facts do not
   disappear — each is rendered, in the section its key belongs to (REQ-5).
2. **`…-tabs_composition_refactor/REQ-37` — the raw payload is one collapsible section among the
   others, collapsed on entry.** Superseded only in its *position*: it is now pinned last (REQ-12).
   Collapsed on entry, selectable and unaltered are kept, and so is
   `plan-ui-coherence-optimisation/REQ-65`'s "the raw payload survives as real selectable text".
3. **The order clause of `…-tabs_composition_refactor/REQ-11`** — "the others follow Config in the
   order Logs, Stats, Processes, Inspect, Exec, Attach". REQ-1 below moves Inspect to second and
   leaves the rest of that requirement — Config drawn first *and* active on entry — untouched.

**And one it deliberately does not follow here**: `plan-ui-coherence-optimisation/REQ-60`, "a group
holding a collection is drawn only when it holds something". On the Config tab that rule was already
amended once (`…-tabs_composition_refactor/REQ-51`). On this tab it is refused outright: the whole
point of the tab is that a field the daemon sent is on screen whether or not it holds anything
(REQ-6). Nothing changes for any other consumer of that rule.

## Values and readings fixed here, and why

No placeholder is left below. Where the spec delegates a decision, it is taken here:

- **"User-friendly graphical representation" is fixed as: sections from the payload's own top-level
  keys, nested groups inside them, one label→value band per leaf** — the human's own suggestion in
  the request, adopted because it is the only composition that survives a key nobody anticipated.
- **Open on entry: the leading scalars section and `State`, everything else closed** (REQ-11). All
  open is several hundred rows in one scroll; all closed is a click per question.
- **The find is a filter over the whole payload, key names and values alike** (REQ-19), because every
  competitor named in the spec ships one and because a tab of collapsed sections without one is a
  worse raw dump than the raw dump. **A filter and not a highlight** — the human's own choice on
  2026-08-27: on several hundred rows, marking the matches still leaves them to be scrolled to.
- **Environment variables are shown in full, unmasked** (REQ-35) — the human's choice on 2026-08-27.
  The spec raises the opposite risk, and the answer to it is that this is the surface whose entire
  purpose is stating what a field exactly says; a hidden value here would be a falsehood told on the
  one screen that exists not to tell any.
- **The formatted reading and the daemon's literal are both on screen** (REQ-17). This is the tab an
  operator opens to check what a field *exactly* says; a formatted value that replaces its literal
  turns the one exact surface into an interpretation.
- **The rewritten coverage must fail on the delivered build** (REQ-28) — the tests are deleted and
  written from scratch, as asked, and a rewrite that passes on the old tab has not been written.

## F1 — Inspect is the second tab

| ID | Requirement |
| --- | --- |
| REQ-1 | Inspect is the second tab of the bar, immediately after Config; the remaining five follow in their present relative order (Logs, Stats, Processes, Exec, Attach). Config is still the tab drawn first and the tab active when the detail opens. |
| REQ-2 | The reorder moves Inspect and nothing else: the same seven tabs are present, none added or removed, each carrying the same uniform treatment with only the active one distinguished, and each showing the content it shows today. |

## F2 — The tab renders the whole payload

| ID | Requirement |
| --- | --- |
| REQ-3 | Every field present in the daemon's inspect response for the container is rendered somewhere in the tab, including keys the application has no specific knowledge of: what is on screen can be checked against the response itself, key by key, and nothing is missing from it. |
| REQ-4 | A key the response does not carry is simply absent from the tab: the tab never draws a field the payload does not hold, so `SizeRw` on a response fetched without sizes is nowhere rather than empty. |
| REQ-5 | The ten curated properties of the delivered tab (`Id`, `Name`, `Image`, `Command`, `Entrypoint`, `Created`, `State`, `Started at`, `Finished at`, `Exit code`) survive as fields of the payload-derived composition and not as a separate summary block: each is readable, each in the section its own key belongs to, and none of them is drawn twice. No summary block stands at the head of the tab: the container's name, short id, state and health stay where the modal's header already carries them. |

## F3 — Empty is shown as empty, and zero is not empty

| ID | Requirement |
| --- | --- |
| REQ-6 | A field whose value is `null`, `""`, `[]` or `{}` is rendered in its own place and explicitly marked as empty: it is never omitted, never merged away into a neighbour, and never silently collapsed into a parent that holds only empties. |
| REQ-7 | `0`, `false` and `"0"` are rendered as the values they are and are never marked empty: an `ExitCode` of `0` reads as zero and a `Privileged` of `false` reads as false. |

## F4 — Sections come from the payload's own top-level keys

| ID | Requirement |
| --- | --- |
| REQ-8 | The tab is divided into sections derived from the response's own top-level keys: each composite top-level value (object or array) becomes a section of its own, labelled with that key, and every scalar top-level value is gathered into one leading section. A top-level key the application has never heard of therefore still lands in a section. |
| REQ-9 | Each section is independently collapsible, and states how much it holds — the number of fields or items beneath it — while it is still closed. |
| REQ-10 | The sections are drawn in the response's own key order, with the gathered scalars section first and the raw payload last; no alphabetical or hand-written ordering is imposed on them. |
| REQ-11 | When the tab is opened, exactly two sections are open — the leading scalars section and `State` — and every other section, the raw payload included, is closed. |
| REQ-12 | The raw payload is the last section of the tab, collapsed on entry, showing the response unaltered as real text that can be selected with mouse and keyboard. |

## F5 — Nesting is rendered as nesting

| ID | Requirement |
| --- | --- |
| REQ-13 | A nested object is rendered as a labelled group of its own fields and a nested array as a list of its items, to whatever depth the payload goes; no value anywhere in the tab is rendered as a line of stringified JSON. |
| REQ-14 | An item of an array is identified by its position in that array, and an array of scalars reads as separate items rather than as one joined string; an array of objects gives each item a group of its own. |

## F6 — Values in the operator's terms, without losing the literal

| ID | Requirement |
| --- | --- |
| REQ-15 | Every field is labelled with the daemon's own key name, so a value on screen can be matched against `docker inspect` output and the Engine API documentation; a friendlier wording may accompany that name, never replace it. |
| REQ-16 | Recognised values are additionally rendered in the operator's terms: timestamps as readable dates, byte counts with a unit, nanosecond durations as durations, booleans as yes/no, state and health as pills, a non-zero exit code in the danger tone and a zero exit code without it, and a port binding as host→container. |
| REQ-17 | A formatted reading never replaces the daemon's literal: for every field REQ-16 formats, the literal the response carried stays readable on the same surface, selectable, without opening the raw payload section. |
| REQ-18 | A sentinel value is annotated only where its meaning is documented and unambiguous — `0` as "no limit" on a resource field — and anywhere else the number is shown as the number, unannotated. |
| REQ-35 | Every value is shown in full, whatever it holds: an environment variable carrying a password or a token is rendered and found exactly like any other field, with no masking, no truncation and no reveal-on-click anywhere in the tab. |

## F7 — Finding a field across the whole payload

| ID | Requirement |
| --- | --- |
| REQ-19 | One control in the tab finds a field by key name or by value across the entire payload, and it **filters**: while it holds text, only the fields that match it are on screen, every section holding a match opens itself however deeply the match sits, and everything that does not match is hidden. The operator opens no section by hand to reach a result. |
| REQ-20 | The find states its outcome: how many fields matched, and a search matching nothing says so rather than leaving a blank tab. Clearing the control restores the whole payload and the section state of REQ-11. |
| REQ-21 | The find reads the payload the tab renders, not a subset of it: a value only present inside a collapsed, deeply nested array is found by it exactly as a top-level scalar is. |

## F8 — What the rebuild must not break

These hold at the end of **every** batch of this plan and are fully closed only when the last of them
lands.

| ID | Requirement |
| --- | --- |
| REQ-22 | The dialog's viewport box — top edge, bottom edge and height — is unchanged by selecting Inspect, by opening or closing any of its sections, and by typing in its find control; the tab's content scrolls inside the dialog, the header and tab bar stay put, and no scrollbar appears on the page behind it. |
| REQ-23 | Opening the tab and typing in its find control stay responsive on a real payload — hundreds of fields, a container on several networks with many port bindings — inside a dialog that may also be holding a live stream, and the responsiveness is measured rather than asserted. |
| REQ-24 | No copy affordance is introduced anywhere in the tab: no copy button, no copy menu entry, no click-to-copy on a value. Selection with mouse and keyboard remains the only route to a value. |
| REQ-25 | Nothing changes in what the application asks of the daemon: no new endpoint, no extra inspect option, no additional or removed request, no change of sampling cadence — and the server's own inspect coverage is untouched. |
| REQ-26 | The other six tabs, the modal's frame, header, stable height and close behaviour, and the containers screen behind it are unchanged, including the return of the point of interaction to the control that opened the detail and the ending of every stream and session on dismissal. |
| REQ-27 | Nothing under `client/src/` outside `client/src/ui/` acquires a raw DOM tag, a `.css` file, a CSS module, an inline `style` prop, a `className` carrying visual utilities, or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index; the generic rendering added to the library carries no Docker vocabulary, no API call and no data fetching, and which key means what stays in feature code. |
| REQ-28 | No surface joins the blur allow-list and none leaves it: no new blurring selector, no blur value other than the single token, no new `ui-blur-exception:` comment. |
| REQ-29 | At 375×812 the tab stays usable: label and value stack instead of clipping, nesting stays legible at depth, no value is truncated to nothing, the find control is reachable and nothing requires horizontal scrolling. |
| REQ-30 | This tab's client-side coverage is deleted and written from scratch, and it re-establishes what is still true of the tab as well as what is new — the raw payload as selectable text, the absence of any copy control, the property band's geometry, and the detail's certified behaviours around it. The rewritten coverage fails on the delivered build. |
| REQ-31 | Every check outside this tab that the reorder invalidates — those naming a tab by position, in this plan's predecessor's coverage included — is rewritten against the new order rather than deleted or weakened into passing. |
| REQ-32 | Every interaction of this change is driven with a real pointer at the visible control's own coordinates — never an element's own `click()`, never a dispatched event, never aimed at a visually hidden input — and the checks assert geometry beside content: the dialog's viewport box before and after selecting the tab, opening a section and filtering, and the control just operated still inside the viewport. |
| REQ-33 | The checks run against the real daemon under the project's test discipline: own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, nothing assumed of the daemon's contents or of application state inherited from another test, and every spec passing when it is run on its own. Every string drawn on screen is English. |
| REQ-34 | Completeness is checked against the payload itself and never against a written list of key names: the check reads the response the tab was given and asserts that the rendering accounts for it, so a daemon carrying a key the developer never saw fails the check by absence rather than passing by omission. |
