---
batch: 1 · blur-policy-guard-rail
feature: Enabling — the narrowed blur rule, written down and enforced
closed_req: [REQ-8, REQ-9, REQ-14]
depends: []
---

# Batch 1 — The blur rule and its guard rail

**Enabling batch, declared as such.** It ships no visible change. It exists because the codebase
currently forbids what batch 2 has to do: `client/scripts/check-ui-conformance.mjs` fails the build
on any `backdrop-filter` / `filter: blur()` under `client/src/` that does not carry a
`ui-blur-exception:` comment, and it is wired into `npm run lint` and `npm run test` for the client
workspace. Leaving the rule as it is and sprinkling exception comments over the new material would
turn a rule into a formality. The rule is narrowed instead, in the same movement, in the checker and
in the prose that states it.

## Baseline (what exists)

- `client/scripts/check-ui-conformance.mjs` — one pass over every `.ts`/`.tsx`/`.css` file under
  `client/src/`. `checkBlurUsage()` flags any line matching `backdrop-filter\s*:` or
  `filter\s*:\s*blur\(`, in **any** file including the UI library's own, unless the line or the line
  above it carries the marker `ui-blur-exception:`. Nothing else in the script concerns blur.
- `client/test/unit/ui-conformance-check.test.ts` — drives the script by spawning it, writing
  fixture files into `client/src/__conformance-fixture__/` and removing them afterwards. Two of its
  cases are about blur (a bare `backdrop-filter` fails; the same with the marker passes), both
  citing `plan-docker_management_app/REQ-108`. One case asserts the current codebase passes.
- `CLAUDE.md`, section "UI — non-negotiable rule" → "Performance — background and blur": states that
  `backdrop-filter` and `filter: blur(...)` are forbidden on panels, surfaces, the shell, modals and
  drawers, with a narrow exception for "a small, short-lived, non-repeated element … if measured and
  justified on the spot". The section also states the static-background rule, which does not change.
- `.sdd/plans/plan-docker_management_app/requirements.md` — `REQ-108` states the same prohibition in
  requirement form and names the automated check; `REQ-109` states that scrolling a dense screen
  stays smooth, with no frame collapse attributable to the glass material.
- `.sdd/.archi` — checked: it does **not** state the blur rule. No intervention needed on it.

The classes the allow-list names all exist today, in `client/src/ui/controls/controls.css`
(`.ui-combobox__list`), `client/src/ui/layout/layout.css` (`.ui-frame__rail`, `.ui-frame__scrim`),
`client/src/ui/navigation/navigation.css` (`.ui-nav-rail`),
`client/src/ui/terminal/session-chrome.css` (`.ui-session-ended-overlay`) and
`client/src/ui/data/log-stream.css` (`.ui-log-stream__jump`). None of them declares a blur yet.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | client, build tooling (`client/scripts/check-ui-conformance.mjs`) | Replace the blanket blur prohibition with an allow-list check. A `backdrop-filter` / `filter: blur()` declaration is a violation **unless** the rule carrying it targets one of the allow-listed overlay selectors — `.ui-combobox__list`, `.ui-frame__rail`, `.ui-nav-rail`, `.ui-frame__scrim`, `.ui-session-ended-overlay`, `.ui-log-stream__jump` — **and** its value is `var(--blur-overlay)` rather than a literal length, so no surface can quietly exceed the bounded radius. The allow-list is a named constant in the script, the single place the list lives in code. Keep the `ui-blur-exception:` marker working as the residual escape hatch for anything outside the list, and keep every non-blur check (raw DOM tags, `style`/`className`, CSS imports) untouched. Violation messages name the file, the line and the offending selector. | REQ-6, REQ-7, REQ-8, REQ-9 | — |
| INT-2 | modify | client, unit test tree (`client/test/unit/ui-conformance-check.test.ts`) | Rewrite the two blur cases against the new rule and add the ones it needs: a fixture stylesheet blurring a non-allow-listed selector fails, naming it; the same declaration on an allow-listed selector, valued with the token, passes with no exception comment; the same on an allow-listed selector with a literal length fails; a blur on `.ui-backdrop` fails (the background is never blurred at runtime); the `ui-blur-exception:` marker still exempts. Keep the "current codebase passes" case, and re-cite the requirements: these cases now serve `plan-liquid_glass_overlays/REQ-8` and `REQ-9`, not `plan-docker_management_app/REQ-108`. | REQ-8, REQ-9 | INT-1 |
| INT-3 | modify | repository root (`CLAUDE.md`, section "Performance — background and blur") | Rewrite the rule as what the code now does: an **allow-list** of surfaces permitted to compute a blur, the prohibition standing everywhere else — not "never inside the content flow", which would be false. State (a) the list itself, by surface, matching INT-1's constant; (b) why it is affordable: one instance of each, at most three toasts at a time, nothing that repeats across a screen, one bounded radius, and the main view — the large, numerous, scrolled surfaces — still paying nothing; (c) the guard rails: the single `--blur-overlay` token as the only legal value and its 20px maximum, the automated check that enforces both, and the `ui-blur-exception:` marker as the only way out; (d) named next to the rest, the two allow-listed surfaces that do sit inside the scrolled content flow — the session-ended overlay and the log stream's jump-to-live control — with the reason they are accepted (a single instance each, one small and one bounded to a detail view) and the note that they are the first thing to withdraw if scrolling regresses. The static-background rule and the pre-blurred-asset rule are unchanged and must stay stated. | REQ-14 | INT-1 |
| INT-4 | modify | plan documents (`.sdd/plans/plan-docker_management_app/requirements.md`) | Narrow `REQ-108` so it stops contradicting the shipped code: runtime blur is absent from the main view — panels, cards, tables, the shell, the docked rail, the backdrop and the log/console/terminal regions — and permitted only on the allow-listed overlay surfaces, bounded by one token, with the same automated check failing outside the list. Keep the id, keep it citable: the specs that reference it must stay valid. Add, next to `REQ-109`, the note that the two content-flow overlays of this plan are a deliberate risk taken against it, pointing at `plan-liquid_glass_overlays` for the reasoning. Change nothing else in that file. | REQ-15 | INT-3 |

## Constraints

- No visible change ships in this batch. Nothing under `client/src/` is edited: after it, the
  codebase still declares no blur anywhere.
- The checker stays a single-pass, dependency-free script reading text. It is not turned into a CSS
  parser: matching the selector of the rule a declaration sits in is enough, and a heuristic that is
  wrong in an exotic case must fail **closed** (report a violation), never open.
- The non-blur half of the conformance check — raw DOM tags, `className`/`style` props, CSS imports
  outside the library — must keep behaving identically; its unit cases stay green untouched.
- `.sdd/.archi` is not edited: it does not state this rule.

## Human acceptance

Add `backdrop-filter: blur(20px)` to `client/src/ui/glass/card.css` and run `npm run lint -w client`:
it fails, naming the file, the line and the selector. Move the declaration onto `.ui-combobox__list`
valued `var(--blur-overlay)`: it passes, and no exception comment appears anywhere in the codebase.
Change the value to a literal `20px`: it fails again. Put it on `.ui-backdrop` instead: it fails.
Undo the experiment and `npm run test -w client` is green. Reading "Performance — background and
blur" in `CLAUDE.md` tells you exactly which surfaces may blur, why that is affordable, and why the
two that sit inside the scrolled content flow are nevertheless accepted.
