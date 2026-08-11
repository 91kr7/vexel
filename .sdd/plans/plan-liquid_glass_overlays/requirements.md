---
slug: liquid_glass_overlays
date: 2026-08-10
spec: inline (no analysis document) — "Apply a real liquid glass effect to the surfaces of the popup, toast and overlay elements. Do NOT apply the blur effect to the panels of the main view — only to popup, toast and overlay elements."
status: validated
---

# Requirements — Liquid glass on overlay surfaces

Scope note: "overlay surface" means, in this application, a surface drawn above what it covers and
present only while an interaction or a state lasts — the dialog surfaces (`Modal` and everything
built on it: `ConfirmDialog`, `FormDialog`, `TransferProgressDialog`, plus `FormSheet`), the toast
stack, the suggestion popup of `Combobox`, the off-canvas navigation drawer at the phone breakpoint,
the session-ended overlay over an interactive terminal, and the log stream's
floating jump-to-live control. "Main view" means everything else on screen: the shell frame, the
header, the docked navigation rail, cards, panels, section surfaces, tables, detail panels, split
panes, and the log / console / terminal surfaces themselves.

**Neither scrim is an overlay surface for this purpose** — not the dialog's (REQ-2) and not the
drawer's (REQ-5). A scrim spans the whole viewport, so blurring one blurs the entire main view,
background asset included, rather than a panel.

## Feature 1 — Real liquid glass on overlay surfaces

| ID | Requirement |
|----|-------------|
| REQ-1 | While a dialog is open, what shows through the dialog's own surface is a blurred rendering of whatever lies behind it, not merely a dimmed translucency: moving the content behind the dialog changes what shows through, and edges behind it are unreadable through the surface. This holds for every dialog in the application, not only for one of them. |
| REQ-2 | The dimmed scrim behind a dialog stays a plain dim: the application behind an open dialog is still sharp outside the dialog's own footprint, and the scrim declares no backdrop blur — so the dialog surface above it is not nested inside a blurred layer whose result its own blur would merely resample. |
| REQ-3 | A toast notification renders a blurred image of whatever it covers, with the same glass treatment as the dialog surfaces. |
| REQ-4 | A suggestion / choice popup opened over the content (the `Combobox` list) renders a blurred image of the content it covers, so the text underneath it is not legible through it. |
| REQ-5 | The off-canvas navigation drawer at the phone breakpoint renders a blurred image of the content behind it. The scrim it slides in over does not: it stays a plain dim, and declares no backdrop blur, so the main view behind an open drawer — background asset included — is dimmed but sharp. |
| REQ-6 | The blur strength of every blurred surface comes from one single named design token, with one documented value (20px) declared as the maximum any surface may use; no component declares a blur length of its own. |
| REQ-16 | The session-ended overlay drawn over an interactive terminal renders a blurred image of the terminal session behind it. |
| REQ-17 | The log stream's floating jump-to-live control renders a blurred image of the log lines it sits over. |

## Feature 2 — The main view keeps a material the browser never blurs

| ID | Requirement |
|----|-------------|
| REQ-7 | No surface of the main view computes a runtime blur: the shell frame, the header, the docked navigation rail, cards, panels, section surfaces, tables, detail panels, split panes and the log / console / terminal surfaces themselves render exactly the material they render today, unchanged in appearance. |
| REQ-8 | An automated check — the one already run by the client's lint and test commands — fails when a runtime blur is declared anywhere in the client outside a named allow-list of overlay surfaces, and passes for the allow-listed surfaces without requiring a per-line exception comment. |
| REQ-9 | The application background stays a static, already-blurred image asset: the backdrop layer computes no filter of its own, and no runtime blur is applied to it. |
| REQ-10 | The number of blurred surfaces the browser has to compose at one moment stays bounded: the toast stack shows at most three toasts at a time, the oldest giving way when a fourth arrives. |

## Feature 3 — Degradation and accessibility of the blurred material

| ID | Requirement |
|----|-------------|
| REQ-11 | On a browser that does not support runtime backdrop blur, an overlay surface stays a legible, distinct surface: its text keeps at least the contrast ratio the application already documents for text on glass, and the content behind it is not readable through it. |
| REQ-12 | The blur takes effect on WebKit-based browsers (Safari), not only on Chromium and Firefox. |
| REQ-13 | When the operator's system asks for reduced transparency, overlay surfaces present an opaque surface instead of the blurred translucent one, with the same layout and the same text contrast guarantee. |

## Feature 4 — The written rule and the code say the same thing

| ID | Requirement |
|----|-------------|
| REQ-14 | `CLAUDE.md` states the rule the code now follows and describes it as it actually is: not "never inside the content flow", but a **named allow-list** of the surfaces permitted to blur, the prohibition standing everywhere else; with the performance rationale that makes the exception affordable (few surfaces at a time, one instance each, small or short-lived, bounded in number), the guard rails that keep it narrow (one bounded radius token, allow-list only, the automated check of REQ-8), and — written next to them — the two allow-listed surfaces that do live inside the scrolled content flow, named, with the reason they are accepted. |
| REQ-15 | No component specification, no in-code comment and no requirement of the existing plan still asserts that a now-blurred surface is never blurred: every such statement — including the comment stating the session-ended overlay is "never blurred" — is updated to the narrowed rule, so nothing in the repository's documents or code comments contradicts the shipped code. |

## Departures and accepted risks

Recorded here so they are discoverable later and are not mistaken for an oversight.

- **Two blurred surfaces live inside the scrolled content flow — REQ-16 and REQ-17 — which is the
  very case the performance rule was written to prevent.** The human was told the trade-off in full,
  including that the log stream's jump-to-live control (REQ-17) is the most expensive of the set — a
  blurred surface sitting over a continuously scrolling, continuously repainted view, so its
  backdrop is resampled on every frame of a scroll — and that the session-ended overlay (REQ-16)
  covers a full 420px terminal surface and stays for as long as the session view is open, i.e. it is
  neither small nor short-lived. They reaffirmed the decision afterwards. It is therefore theirs, and
  it is implemented.
- **Named consequence: `plan-docker_management_app/REQ-109`** ("scrolling a dense screen … stays
  visually smooth … no frame collapse attributable to the glass material") **and the
  `scroll-area.md` invariant "scrolling never drives a recomputed blur" are both put at risk by
  REQ-17, and to a lesser degree by REQ-16.** The mitigation is confinement, not measurement: one
  instance of each, both small in count, the radius bounded by the single token of REQ-6, and
  nothing else in the content flow permitted to blur (REQ-8). If scroll smoothness regresses on a
  real machine, REQ-17 is the first thing to withdraw — it is the cheapest to remove and the one
  with the least visual return.
- **`plan-docker_management_app/REQ-108` is contradicted by this plan and must be narrowed**, not
  merely annotated: as written it forbids runtime blur on "panels, surfaces, the shell, modals or
  drawers", which REQ-1, REQ-5, REQ-16 and REQ-17 all break. Handled by REQ-15.
- **Nothing in the automated suite proves the blur actually applies in a real browser.** By the
  human's decision the verification is unit-level and stylesheet-text-level only: the narrowed
  conformance check plus the existing unit tests. jsdom computes no `backdrop-filter`, and no e2e
  computed-style check is added. What the suite guarantees is that the declaration is present where
  it must be and absent where it must not be; that the result *looks* like liquid glass stays a
  human's judgement on a real browser.
