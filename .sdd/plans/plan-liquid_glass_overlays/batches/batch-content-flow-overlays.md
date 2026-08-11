---
batch: 3 · content-flow-overlays
feature: The two overlays inside the scrolled content flow — the session-ended overlay and the log stream's jump-to-live control
closed_req: [REQ-15, REQ-16, REQ-17]
depends: [2]
---

# Batch 3 — The two content-flow overlays

Kept apart from batch 2 on purpose. These two surfaces are the ones that contradict the rationale
justifying the narrowed rule: they do not float above the application, they sit **inside** a
scrolling, repainting content region, which is precisely the case the performance rule was written
to prevent. The human was told this in detail — including that the log stream's control is the most
expensive of the set, and that the session-ended overlay covers a full 420px surface and stays for
as long as the session view is open, so it is neither small nor short-lived — and reaffirmed the
decision. It is implemented, honestly and in one isolable batch: if scrolling regresses on a real
machine, this batch is what gets withdrawn, and nothing else has to move.

## Baseline (what exists)

- `client/src/ui/terminal/session-chrome.css` — `.ui-session-surface` is a `position: relative`,
  **420px-tall** block; `.ui-session-ended-overlay` covers it entirely (`position: absolute;
  inset: 0`) with `--color-surface-sunken` and `--radius-md`, and carries the comment
  *"Overlaid over the terminal surface, translucent — never blurred."* That comment is now false and
  is part of this batch's work.
- `client/src/ui/data/log-stream.css` — `.ui-log-stream__jump` is a small `position: absolute`
  control pinned bottom-right of the log surface (the jump-to-live affordance), shown while the
  stream is not following the tail. The surface under it repaints continuously as lines arrive and
  as the operator scrolls.
- `client/src/ui/terminal/terminal.css` and the terminal host — the emulator surface itself. It is
  main view and stays unblurred.
- Both host regions live inside `.ui-frame__content`, the application's scrolling content column.
- The overlay glass material, its token, its `@supports` fallback and its reduced-transparency
  variant all exist from batch 2. This batch adds no material: it reuses that one.
- Both selectors are already on the conformance check's allow-list from batch 1, so no tooling
  change is needed here.
- Specs stating the contrary: `.sdd/modules/ui-library/specs/session-chrome.md` ("No blur is applied
  to the overlay; it is a translucent wash over the terminal, static"), `log-stream.md` ("No
  animation and no blur is applied to the region"), `scroll-area.md` ("Scrolling never drives an
  animation or a recomputed blur (REQ-109)"), `terminal.md` ("No `backdrop-filter`/`filter: blur()`
  is applied; the host is translucent, not blurred").
- `client/test/unit/log-stream.test.tsx` asserts the whole `log-stream.css` declares no
  `backdrop-filter` and no `filter: blur(`. It contradicts this batch and is narrowed here.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | client, UI library (`client/src/ui/terminal/session-chrome.css`, `.ui-session-ended-overlay`) | Give the session-ended overlay the overlay glass material from batch 2 — the same token, the same `-webkit-` counterpart, the same `@supports` and reduced-transparency guards, obtained by reusing that material rather than by restating its declarations. Replace the "never blurred" comment with the truth and the reason: a single instance, present only once a session has ended, accepted despite living inside the scrolled content flow. The terminal host underneath is not touched. | REQ-15, REQ-16 | — |
| INT-2 | modify | client, UI library (`client/src/ui/data/log-stream.css`, `.ui-log-stream__jump`) | Give the jump-to-live control the same material, reused the same way, and only the control: the log region itself, its lines, its match highlighting and its virtualised scroller keep declaring no blur and no animation. Record on the spot that this is the most expensive surface on the allow-list — small, but sitting over a view that repaints on every scrolled frame — and that it is the first candidate for withdrawal if scrolling regresses. | REQ-15, REQ-17 | — |
| INT-3 | modify | ui-library module specs (`.sdd/modules/ui-library/specs/`: `session-chrome.md`, `log-stream.md`, `scroll-area.md`, `terminal.md`) | Correct the invariants these two changes invalidate, and only those. `session-chrome.md`: the overlay carries the overlay glass material, blurred, single instance. `log-stream.md`: the **region** carries no animation and no blur; its floating jump-to-live control carries the overlay material. `scroll-area.md`: "scrolling never drives a recomputed blur" becomes true-with-a-named-exception — the log stream's control — citing the risk this plan records against `plan-docker_management_app/REQ-109`. `terminal.md`: the host stays unblurred; say so without implying the overlay above it is. Cite requirements by id. | REQ-15 | INT-1, INT-2 |
| INT-4 | modify | client, unit test tree (`client/test/unit/log-stream.test.tsx`) | Narrow the "no blur" case to what stays true: the log region's own declarations carry neither animation, transition nor blur, while the jump-to-live control declares the token-valued blur. The distinction is the point of the test — a blanket assertion either forbids this batch or stops guarding the region. Add the equivalent stylesheet-level case for `.ui-session-ended-overlay`, keeping the terminal host asserted unblurred. | REQ-16, REQ-17 | INT-1, INT-2 |

## Constraints

- **Only the two overlays.** The terminal host, the log region, the console surface and every
  scroll container keep declaring no blur. `console-surface.test.tsx` must stay green untouched.
- **No second material.** Both surfaces reuse batch 2's, so the fallbacks and the bounded radius
  come with them; a copied declaration would be a second place for the value to drift.
- **Nothing repeats.** One session-ended overlay per session view, one jump control per log stream.
  If a screen can ever show several at once, that is a finding to report before implementing, not a
  detail to absorb.
- The conformance check and `CLAUDE.md`'s allow-list already name both selectors: they need no edit
  here. If either does need one, the rule and the code have diverged and that is worth stopping for.
- Verification is unit-level: stylesheet text and jsdom. Nothing here proves the effect renders, and
  nothing measures the scroll cost — that judgement is the human's, on a real browser, and it is the
  acceptance below.

## Outcome — INT-1 was implemented, seen, and withdrawn

The intervention table above records what was planned; this records what shipped, so the two are
never mistaken for each other. **INT-1 was carried out and then reversed on the human's sight.**
Blurred, the session-ended overlay did not read as a card of glass over the session: being
`inset: 0` over the whole terminal region, it read as the terminal having gone out of focus — the
objection that had already taken both scrims off the allow-list, one scale down. A terminal is also
the worst backdrop for the effect: small monospace glyphs on a near-uniform dark field smear at 20px
into a flat rectangle in which no glass is legible.

The overlay is therefore a plain dim declaring `backdrop-filter: none`, `.ui-session-ended-overlay`
is off the allow-list, and REQ-16 in `requirements.md` states the decision rather than the original
intent. INT-2 (the jump-to-live control) stands as planned and is now the only blurred surface
inside the scrolled content flow — so the risk this batch carried against
`plan-docker_management_app/REQ-109` is halved, and what remains is documented there.

## Human acceptance

Open a container's exec/attach session and end it: the "session ended" overlay shows the terminal
behind it dimmed and still sharp. Open a container's logs, let lines arrive, scroll up until
the jump-to-live control appears: it shows the log lines under it blurred — and scrolling that log,
with a detail panel open on a dense screen, still feels smooth on your machine. Search the
repository for a statement contradicting either surface: there is none left, in a document
or in a comment.
