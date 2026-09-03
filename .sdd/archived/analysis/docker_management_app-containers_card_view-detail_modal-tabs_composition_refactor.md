---
request_slug: docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor
date: 2026-08-26
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-containers_card_view-detail_modal.md
---

## Request

> Refactor the graphics of the container detail modal — the dialog holding the seven tabs (Logs,
> Stats, Config, Processes, Inspect, Exec, Attach) — working from a mock that already exists and that
> the human commissioned for exactly this purpose. The mock is at
> `.sdd/analysis/ui-mock/container-detail-tabs.html`. It is a rendered page that states its findings
> about the current dialog, each with the reasoning behind it, the measurements it rests on, and a
> drawn proposal of where that part of the interface should go. It is the substance of this request —
> do not re-derive the findings, take them from there.
>
> The human's instruction about how the mock is to be used: *"the developer must follow the mock to
> the letter — except possibly colours, shadows and highlights, which must be the ones already
> implemented across the whole application."*
>
> Two further things about the mock that bear on requirements: its closing note says it is not a
> specification of values — the measurements written in it were offered as proposals to discuss, not
> decided figures; and the mock names one of the findings as the one to do first if only one gets
> done, and gives the reason.

The mock: [`ui-mock/container-detail-tabs.html`](ui-mock/container-detail-tabs.html), published at
<https://claude.ai/code/artifact/3c9b76b9-6224-4017-8cfb-361ac5e2e5c1>.

## Reference

Evolution of
[`docker_management_app-containers_card_view-detail_modal.md`](docker_management_app-containers_card_view-detail_modal.md),
which moved the container detail out of the card row onto the product's large-format modal — under
the explicit requirement that **the detail's content be unchanged**: the same tabs, in the same
order, with the same data, operations and confirmations.

**Starting point.** The seven tabs render inside the modal exactly as they rendered inside the inline
panel, layout decisions included.

**Changes:** the content is recomposed for the surface it now lives on — one stable dialog height,
an identity-bearing header, Config first, and a per-tab layout revised in the mock's nine change
points. This is new design work, not a patch; **two of the points are nonetheless leftovers of that
delivery** and should be scheduled as the cheap, undebatable pair: F1 is a regression against a
mockup already approved — the status dot, the state pill and the short id were in it and were not
built, the modal receiving the single string `Container — payments-service` — and F6's
`MAX_TABLE_HEIGHT = '320px'` is a measure taken for the inline panel that nothing revisited when the
panel moved.

## Summary

Recompose the seven tabs of the container detail modal to the commissioned mock: a dialog height that
does not move between tabs, a header carrying the container's identity and state, and a per-tab
layout that suits a centred, content-sized surface.

## Business goal

**The content arrived intact and the surface changed underneath it.** That was the right constraint
for the move, and it is what leaves the work here. The frame now jumps on every tab change — the most
frequent gesture inside this dialog — because the seven tabs differ in height and the centring
redistributes the difference top and bottom. A 320px process table sits in an 860px dialog leaving
half the surface empty. The header says less than the card the operator just left. Three points also
put back information currently unreadable or absent: the health outcome, a non-zero exit code, and
the level of a log line — when finding the first error is almost always why the logs were opened.

## Requirements

### Functional

- **F0 — one height for the whole detail, and the tab's content scrolls inside it.** The dialog's
  frame stays put across every tab change and every reveal within a tab. **This is the one to do
  first if only one is done**, for the mock's own reasons: it is the only point noticeable without
  knowing to look for it; it makes the others possible, since Processes and the terminals cannot take
  the available height while that height depends on them; and it closes the residue of REQ-25 — the
  health-check switch growing the dialog 85.2px and lifting its top edge 42.6px — without anchoring
  anything.
- **F1 — the header carries the container's identity**: status dot, name, state pill, health pill
  when the container has a health check, and the short id, replacing the single `Container — <name>`
  string whose prefix states what the operator already knows.
- **F1b — Config is the first tab and the one active on open**, ending the split between the tab
  drawn first (`logs`) and the one opened on; Config leads as the most frequent reason to open.
- **All seven tabs share one treatment, with only the active one distinguished.** The muted `Exec`
  and `Attach` in four of the mock's figures are a drafting device marking the two tabs it makes no
  proposal about — confirmed by the mock's author — and must not be read as a permanent
  de-emphasis of two tabs on a running container.
- **F2 — Stats is two metrics then three.** CPU and Memory have a ceiling and keep their meter; Net
  I/O, Block I/O and PIDs have none and carry a sparkline instead of a meter that cannot fill in
  proportion to anything. The sparkline gains an area fill and a marked final point; Net I/O shows in
  and out as two distinguished values rather than one `a / b` string.
- **F3 — Config in reading**: environment variables as key and value aligned on two tracks instead of
  raw `KEY=value` strings, mounts as their own counted section with a `ro`/`rw` chip instead of the
  literal `mount:` prefix, and `Edit configuration` at the head of the tab it acts on rather than at
  the foot of one of its two columns.
- **F4 — Config in editing is grouped into cards**, the small groups side by side rather than stacked
  as titles on a continuous ground.
- **F4b — the recreation warning appears in the edit form's footer while the operator edits, and the
  existing post-save confirmation stays.** Read to the letter the mock moves the warning; it is
  **added**, because withdrawing an explicit confirmation before a container is stopped, removed and
  recreated is a safety decision this request does not make.
- **F5 — the log controls form two labelled groups that wrap as whole blocks**: those that change
  what is asked of the daemon (streams, tail, since/until — they reopen the stream) and those that
  change only how it is read (timestamps, search, download).
- **F5b — log lines are distinguished by level and by stream**, level deduced from the line's text
  and stderr distinguished from stdout, so an error and a success do not read alike.
- **F6 — the process table takes the height its container offers** instead of the fixed `320px`
  inherited from the inline panel, and a `%CPU` above threshold is distinguished so the consuming
  process is found without reading all the rows.
- **F6b — Inspect is grouped into Identity and Lifecycle** instead of ten flat properties, `State`
  reads as a pill rather than a word, a non-zero exit code reads as bad news, and the raw payload
  becomes collapsible like the other sections instead of the only one always open.

### Non-functional

- **Every visual element comes from the UI library**, extended first where it does not yet cover a
  point — the mock itself locates the three library-level changes in `Modal` (stable height as an
  opt-in; a title that accepts content rather than only a string), `Sparkline` and `LogStream` — and
  no CSS or raw markup appears in feature code.
- **The stable height is an opt-in, and the other four large-format dialogs are untouched.**
- **The detail stays usable at 375×812**, where the presentation is effectively full-viewport: no tab
  unreachable, no value clipped to nothing, the terminal and log views operable.
- **Nothing joins or leaves the blur allow-list**, and the log stream's jump-to-live control, already
  allow-listed and now nested inside an overlay, still blurs.
- **The detail's data, operations and APIs are unchanged**: every point here is composition,
  presentation or a library variant — no new capability, no new endpoint, no cadence change.
- **Checks drive real pointers at the visible control's coordinates and assert geometry** — for F0,
  the dialog's viewport box before and after a tab change and across the health-check reveal that
  produced REQ-25's residue.
- **Verified in the delivered product against the real daemon**, under the project's test discipline:
  own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, nothing assumed of the daemon or of
  inherited application state, every spec passing on its own.

## Constraints

- **The mock is authoritative on composition and not on material.** Layout, structure, grouping,
  hierarchy, what is shown and where: follow it to the letter. Every colour, shadow, highlight and
  the rest of the visual material is the one the application already implements, taken by name from
  `client/src/ui/tokens.css`. The mock's own `:root` block — its comment says it is *lifted from* that
  file so the page reads as the product — is a device that lets it open as a single standalone file,
  and is never reproduced in code.
- **Its *semantic* use of colour is composition and does stand.** `%CPU` above threshold, a non-zero
  exit code in a danger tone, `ro` against `rw`, a log line by level: what carries a role is decided
  by the mock; the value behind that role is the token the application already has.
- **The composition is settled and the numbers are open.** The mock's closing note says it is not a
  specification of values: `min(78vh, 860px)` and the colour thresholds are proposals to discuss,
  and the figures are set in the later phases.
- **Interface strings are English.** The mock's prose is Italian commentary; every string it draws in
  the interface is already English (`Runtime configuration`, `Fetch`, `Read`, …) and stays so.
- **The certified predecessors stay certified** and are named in the checks rather than assumed: the
  modal's own requirements — content parity aside, which this supersedes — its close control, focus
  return, stream lifecycle and resolution when the container disappears; the dialog sizing rules; the
  sampling gate; REQ-25's switch.

## Assumptions

- **The nine change points of the mock's summary table are the work**: F0, F1, F1b, F2, F3, F4, F5,
  F6, F6b. Enumerated rather than counted, the mock drawing F0 as the cross-cutting one and F1–F6 as
  the per-tab findings.
- **Exec and Attach change only by inheriting F0's stable height.** The mock proposes nothing else
  for them, and their sessions, controls and behaviour are untouched.
- **The mock's figures show a plausible container, not required data.** `healthy`, `137 · SIGKILL
  (OOM)` and the drawn log lines are samples; what is required is that each has a place and a
  treatment.
- **Containers only.** The images detail panel keeps its inline expansion and its own composition;
  library components changed here serve it as they already do, without a redesign of its screen.

## Risks

- **A log level deduced from text is a guess, and a wrong guess is worse than no colour.** A line
  containing `error` inside a URL reads as a failure, and trust in the colouring is lost the first
  time it misleads; the deduction must be conservative and the raw text stay readable.
- **A fixed height can be worse than a moving one on a short viewport**, where every tab is bounded
  by it and content that used to be allowed to grow now has to scroll.
- **`Modal` grows an opt-in that four other dialogs do not take.** A library component acquiring a
  mode for one consumer is how divergence starts; it must be a variant, not a second dialog.
- **"Follow the mock to the letter" invites copying its stylesheet.** The mock is a single file with
  colours, radii and shadows written out; the constraint above is the whole defence, and a value
  copied from it will look right and be wrong.
- **The tab reorder and the header change break existing checks that name tabs by position or read
  the modal's title string** — they are rewritten, not deleted.
- **Nine points at once makes the regression surface the whole dialog**; F0 first is the mock's own
  answer, and the rest can follow in any order.

## Scope

**In scope:** the nine change points of the mock's summary table, inside the container detail modal —
its stable height as a library opt-in, the identity-bearing header, Config first, the tab treatment
being uniform across all seven, the Stats 2+3 arrangement with the sparkline and Net I/O changes, the
Config reading and editing layouts with the recreation warning added to the form footer, the log
controls in two labelled groups with lines coloured by level and stream, the process table taking the
available height with `%CPU` above threshold distinguished, and Inspect grouped into Identity and
Lifecycle with a collapsible raw payload; the library extensions those require in `Modal`,
`Sparkline` and `LogStream`; and rewriting the coverage the reorder and the header change invalidate.

**Out of scope:** the detail's data, operations, confirmations, tabs as a set, and the APIs behind
them; the Exec and Attach sessions beyond inheriting the stable height; the other four large-format
dialogs; the containers cards, their actions, the screen's toolbar, filters and ordering; the
sampling cadence and its liveness gate; the images detail panel; the blur allow-list and the
conformance check; and the mock's proposed figures as literal values.
