---
slug: liquid_glass_overlays
date: 2026-08-10
spec: inline (no analysis document) — see `requirements.md`
status: validated
---

# Batches — Liquid glass on overlay surfaces

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| 1 · blur-policy-guard-rail | Enabling batch — the narrowed blur rule, written down and enforced. Not a user-facing feature: it is the guard rail without which batch 2 cannot go green, since the existing conformance check rejects every `backdrop-filter` in the client. | REQ-8, REQ-9, REQ-14 | — | certified | Add `backdrop-filter: blur(20px)` to a main-view stylesheet (`client/src/ui/glass/card.css`) and run `npm run lint -w client`: it fails, naming the file, the line and the selector. Move the same declaration onto an allow-listed selector (`.ui-combobox__list`), valued `var(--blur-overlay)`: it passes, with no exception comment anywhere. Replace the token with a literal `20px`: it fails again. Put the declaration on `.ui-backdrop` instead: it fails. Undo the experiment; `npm run test -w client` is green. Reading "Performance — background and blur" in `CLAUDE.md` tells you exactly which surfaces may blur, why that is affordable, and why the one that sits inside the scrolled content flow is nevertheless accepted. |
| 2 · overlay-glass-material | Real liquid glass on the overlay layer: dialog surfaces, toasts, the choice popup and the phone navigation drawer — with the fallbacks the material needs. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-10, REQ-11, REQ-12, REQ-13 | 1 | certified | Open any dialog (remove a container → the confirmation): the application behind it stays **sharp** and merely dimmed, while through the dialog's own surface the content behind it is visibly out of focus. Same for a long form sheet (create a container) and for a transfer dialog (pull an image). Trigger four toasts in a row: at most three are on screen at once, the oldest giving way to the fourth, each showing a blurred image of what it covers. Type in a field with suggestions until its list opens: the rows underneath it are blurred and no longer readable through it. Narrow the window below 720px and open the navigation drawer: the drawer card blurs what it covers while the rest of the screen, behind the scrim, is dimmed but sharp; widen it again and the docked rail is exactly as before. Everywhere else nothing moved: side by side with the previous build, cards, tables, headers, detail panels, the log, console and terminal surfaces are identical. With the system set to reduced transparency, dialogs, toasts and the popup turn opaque and stay perfectly readable. |
| 3 · content-flow-overlays | The two overlays that live inside the scrolled content flow: the session-ended overlay over a terminal, and the log stream's floating jump-to-live control. Kept apart on purpose — the batch carrying the accepted performance risk, so it could be judged and if need be withdrawn on its own. It was: the session-ended overlay's blur was implemented, seen and withdrawn (REQ-16), leaving the jump-to-live control. | REQ-15, REQ-16, REQ-17 | 2 | certified | Open a container's exec/attach session and end it: the "session ended" overlay shows the terminal behind it dimmed and still sharp — the blur was implemented here, seen and withdrawn (REQ-16). Open a container's logs, scroll up until the jump-to-live control appears: it shows the log lines under it blurred, and scrolling that log — while a detail panel is open on a dense screen — still feels smooth on your machine. Search the repository for a statement contradicting either surface: there is none left, in a document or in a comment. |

Batch statuses are advanced only by the orchestrators of the later phases.

## Assumptions and decisions

- **Slug and spec.** The spec was given inline, with no analysis document; the plan slug
  `liquid_glass_overlays` was derived from it. `requirements.md` carries the spec text verbatim in
  its frontmatter so the plan is self-contained.
- **The blur token is named `--blur-overlay` and is fixed by this plan, not by the implementer.**
  The guard rail of batch 1 has to name it (it rejects a literal blur length), and batch 1 ships
  before the token exists. Its value is 20px and it is the maximum any surface may use (REQ-6).
- **The allow-list is expressed by selector, not by file.** A file-based list could not be exercised
  by the conformance check's own fixture tests, and it would not state the rule that actually
  matters — *which surfaces* may blur. Batch 1 allow-listed six selectors and batch 2 added the one
  class its own material introduces; the list has since lost two of them on the human's sight —
  `.ui-frame__scrim` (a scrim blurs the whole main view, not a panel) and
  `.ui-session-ended-overlay` (REQ-16), leaving `.ui-overlay-glass`, `.ui-combobox__list`,
  `.ui-frame__rail`, `.ui-nav-rail` and `.ui-log-stream__jump`. The `ui-blur-exception:` marker survives as the residual, commented escape
  hatch for anything outside the list, exactly as `CLAUDE.md` already describes it.
- **The blur goes on the dialog surface, never on the dialog scrim** (REQ-2), by the human's
  decision. Beyond the look it buys, it avoids the trap: an element carrying `backdrop-filter`
  becomes a backdrop root for its descendants, so a blurred scrim would leave the dialog nested
  inside it resampling an already-blurred, already-dimmed layer — paying twice for one effect. The
  phone drawer was planned the same way for its own scrim, which is **not** what shipped: the scrim
  spans the whole viewport, so blurring it blurred the entire main view rather than a panel, and the
  human withdrew it on sight. The drawer card blurs; its scrim is a plain dim (REQ-5).
- **No portal, no overlay root — and none is introduced.** Dialogs, sheets and toasts render inline
  in the React tree and escape the layout through `position: fixed` and the `--z-*` tokens. It was
  checked that no ancestor declares `filter`, `opacity`, `mask`, `mix-blend-mode` or `transform`, so
  each overlay's backdrop root is the document and its blur samples the whole page — the static
  background asset and the panels above it — which is what the effect needs. Introducing a portal
  would be a change of shell architecture this spec does not ask for.
- **`.sdd/.archi` needs no change.** It was read in full: it does not state the blur rule (it
  mentions the conformance script only in passing, about how to invoke the client's test scripts).
  The rule lives in `CLAUDE.md` and in the component specs, which is where REQ-14 and REQ-15 act.
- **The native `<select>` popup is out of reach.** `Select` renders a native `<select>`; its dropdown
  is drawn by the browser and cannot carry a material. REQ-4 is therefore about `Combobox`'s own
  list, the application's only styled popup. Stated as a limit, not planned around.
- **`prefers-reduced-motion` is not involved.** The material adds no animation and no transition; the
  blur is static once painted. Only `prefers-reduced-transparency` is honoured (REQ-13).
- **Verification is unit-level only**, by the human's decision: the narrowed conformance check and
  the client unit tests, all of which read stylesheet text or render into jsdom. No new e2e check, no
  Docker daemon, no network, no state left behind — the batches touch only the client's UI library
  and its unit tree, so the "Tests" rules of `CLAUDE.md` are satisfied by construction.

## Departures

Recorded in full, with their reasons, in the "Departures and accepted risks" section of
`requirements.md`. In summary, and **all four require a correction outside this plan**:

1. **`plan-docker_management_app/REQ-108` is contradicted and must be narrowed.** As written it
   forbids runtime blur on "panels, surfaces, the shell, modals or drawers"; REQ-1, REQ-5, REQ-16 and
   REQ-17 all break it. Batch 1 · INT-4 rewrites it. Human decision.
2. **`CLAUDE.md`'s "Performance — background and blur" rule is narrowed.** Runtime blur stops being
   forbidden-with-a-measured-exception and becomes permitted-on-a-named-allow-list. Batch 1 · INT-3.
   Human decision.
3. **Two of the allow-listed surfaces sit inside the scrolled content flow** — REQ-16 and REQ-17 —
   which contradicts the very rationale that makes the narrowed exception defensible, and puts
   `plan-docker_management_app/REQ-109` (scrolling stays smooth, no frame collapse attributable to
   the glass material) and the `scroll-area.md` invariant "scrolling never drives a recomputed blur"
   at risk. The human was given the trade-off in detail — including that the log-stream control is
   the most expensive of the set, and that the session-ended overlay is neither small nor
   short-lived — and reaffirmed the decision. Implemented in batch 3; the specs are corrected there
   rather than left contradicting the code.
4. **Nothing automated proves the effect reaches a real browser.** Accepted limitation of the
   unit-only verification the human chose; the visual result is a human's judgement.

## Coverage check

Every REQ is served by at least one INT, and every INT serves at least one REQ. No enabling INT is
left without a requirement.

| REQ | Served by | Closes in |
|-----|-----------|-----------|
| REQ-1 | batch-blur-policy-guard-rail/INT-1 (permits it), batch-overlay-glass-material/INT-2, INT-3, INT-4, INT-5, INT-11 | 2 |
| REQ-2 | batch-overlay-glass-material/INT-6, INT-11 | 2 |
| REQ-3 | batch-overlay-glass-material/INT-7, INT-11 | 2 |
| REQ-4 | batch-overlay-glass-material/INT-8 | 2 |
| REQ-5 | batch-overlay-glass-material/INT-9 | 2 |
| REQ-6 | batch-blur-policy-guard-rail/INT-1 (rejects a literal length), batch-overlay-glass-material/INT-1, INT-3, INT-10 | 2 |
| REQ-7 | batch-blur-policy-guard-rail/INT-1, batch-overlay-glass-material/INT-3, INT-9, INT-11 | 2 |
| REQ-8 | batch-blur-policy-guard-rail/INT-1, INT-2 | 1 |
| REQ-9 | batch-blur-policy-guard-rail/INT-1, INT-2 | 1 |
| REQ-10 | batch-overlay-glass-material/INT-7, INT-11 | 2 |
| REQ-11 | batch-overlay-glass-material/INT-2, INT-11 | 2 |
| REQ-12 | batch-overlay-glass-material/INT-2, INT-11 | 2 |
| REQ-13 | batch-overlay-glass-material/INT-2, INT-11 | 2 |
| REQ-14 | batch-blur-policy-guard-rail/INT-3 | 1 |
| REQ-15 | batch-blur-policy-guard-rail/INT-4, batch-overlay-glass-material/INT-10, batch-content-flow-overlays/INT-1, INT-2, INT-3 | 3 |
| REQ-16 | batch-content-flow-overlays/INT-1, INT-4 | 3 |
| REQ-17 | batch-content-flow-overlays/INT-2, INT-4 | 3 |

Requirements completed across several batches, and where they close:

- **REQ-6** — the guard that forbids a literal blur length lands in batch 1; the token it points at
  is created in batch 2. Closes in batch 2, where a blur first exists to be bounded.
- **REQ-7** — the automated half (nothing outside the allow-list may blur) lands in batch 1; the
  observable half (the main view looks exactly as it did) can only be judged once the material
  exists. Closes in batch 2. Batch 3 must preserve it: it blurs two overlays *inside* content
  regions, never the regions themselves.
- **REQ-15** — each batch corrects the documents and comments it invalidates: batch 1 the plan-level
  `REQ-108`, batch 2 the specs of the surfaces it changes, batch 3 the specs and the in-code comment
  of the two content-flow overlays. Closes in batch 3, the last of them.
