---
slug: docker_management_app-dialog_sizing
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-dialog_sizing.md
status: validated
---

# Requirements — A dialog's glass card is the size of the dialog it holds

Fix of the delivered product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); this is bug-1 of the
human's `bugs.md`, the fourth of six items and the first of them that lands in the shared UI library
rather than on a screen.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

Visual reference: `bugs-screen/bug-1.png`, normative only for **which** failure is meant — the Create
context dialog with the right half of its card empty.

**One defect, one component, one feature.** Every dialog in the product is drawn through the same
shared dialog positioner and surface; the eleven places the human listed are eleven symptoms of one
cause, and the four large-format dialogs hang off the same wrapper. The requirements below are
therefore written about the dialog surface, not about the screens that open it.

**What the two failure modes are called here.** *Too wide* — the glass card extends beyond the
content it holds, leaving a band of empty glass (measured on five real dialogs, +217px to +752px).
*Too narrow* — the glass card is smaller than the designed dialog width (produced by deliberate
experiment: replacing a dialog's description with a short string collapses the card to 397.5px; no
natural instance found in the product). Both are the same cause and both must be verified.

**Correction, recorded rather than quietly amended.** An earlier statement of this plan said the
too-narrow mode left the content 82px *outside* its own surface — 398px of glass around 480px of
content. That was a measurement error: the reading of the content was taken after the experiment's
text had already been restored. Measured in the same instant, the card is 397.5px and the content
395.5px — they **agree**, because `min(480px, 100%)` resolves its percentage against the collapsed
card, so the content follows the card down. **Nothing is rendered outside its surface, in either
direction, on this build.** The too-narrow failure is a dialog rendered 397.5px wide where 480px was
designed — a width that depends on the length of its own copy, which is REQ-3, REQ-4 and REQ-7 —
and not an overflow. The requirement on the too-narrow direction stands, because the mechanism
permits it and a later change to the content's own sizing would expose it; but it is a guard against
a reachable state, not a description of an observed one, and it must not be written up as though it
had been seen.

**No number is fixed by this plan.** The requirements are about card and content *agreeing*, and
about that agreement surviving a later retuning of whatever width the library designates. A change
that reproduced today's widths while leaving card and content measured by two independent rules
satisfies none of this.

**REQ-7 and REQ-8 are not the exception to that, and the distinction must not be collapsed later.**
What may never be written into a requirement is *the value 480* as the definition of correctness —
that is REQ-6's job to prevent. What REQ-7 and REQ-8 pin is a different thing: that this fix has no
visual side effects. The two are compatible, and the second is what makes the fix reviewable — if a
dialog's width moves, that is a regression of this change, not a matter of taste.

## F1 — A dialog's glass card is the size of the dialog it holds

| ID | Requirement |
| --- | --- |
| REQ-1 | The glass card of an ordinary dialog is exactly as wide as the content it holds: there is no band of empty glass to either side of the content, at any content length. |
| REQ-2 | No dialog's content is wider than the glass card holding it: no text and no control is rendered outside the surface meant to contain it. This is the mode that does not occur naturally in the product today — it appears only with short content and must be constructed deliberately to be observed — and it is required, verified and guarded exactly like REQ-1. |
| REQ-3 | A dialog's width does not vary with the length or the wrapping of its text: the same dialog presented with a single short sentence and with a long paragraph is the identical width, and differs only in height. |
| REQ-4 | A dialog's width does not vary with runtime data: the registry log-out confirmation is the same width for a short registry hostname and for a long one, so two operators looking at the same dialog see the same surface. |
| REQ-5 | All ordinary dialogs of the product present at one single common width — the eleven the human listed included: prune stopped containers; initialize swarm; join swarm; import filesystem; both volume/network prune dialogs; registry log in; registry log out; create builder; create context; install plugin; system prune and its related prune dialogs. Today these show eleven different widths; afterwards they read as one family. |
| REQ-6 | The agreement between card and content is a property of the mechanism, not of a value: the ordinary dialog's designed width is stated in one place in the library, and changing it there moves the card and the content together, leaving them in agreement at the new value with nothing else edited. |
| REQ-7 | The ordinary dialog's designed width is not altered by this change: an ordinary dialog occupies the same width on screen after the fix as before it. The box that carries the designed width is the **card** — what the operator sees and measures. The content column inside it is that width less the glass's own hairline border on each side, so it reads two pixels narrower once the width moves onto the card; that is the border becoming visible in the numbers, not a change of the design. A fix that widened the card to keep the content's number identical would be altering the dialog to preserve an internal measurement, which is the opposite of this requirement. |
| REQ-8 | The large-format dialogs — image diff, layer efficiency, layer explorer, filesystem browser — keep the wide format they are entitled to and are not narrowed towards the ordinary width; their designed width is likewise unaltered by this change, and their card is exactly the size of their content, in both directions. |
| REQ-9 | Where the viewport rather than the designed width is what limits a dialog — a narrow window, a phone-width viewport, a large dialog on a small screen — the card and the content still agree, the dialog keeps the same clearance from the edges of the screen it keeps today, and nothing overflows the viewport horizontally. |
| REQ-10 | The dialog continues to answer content in height: it grows vertically with what it holds, over-tall content still scrolls inside the dialog as it does today, and the card is the height of its content with no band of empty glass above or below it. |
| REQ-11 | Nothing else about how a dialog is drawn changes: same glass treatment, same padding, spacing and typography, same placement in the viewport, same scrim, same open and close behaviour. Any observable difference beyond the card's width is a defect of this change. |
| REQ-12 | Nothing about what any dialog contains, asks for, validates or performs changes; no dialog's wording is edited to make its surface look right; no dialog is added or removed. |
| REQ-13 | The separate sheet-style form surface (`FormSheet`), which positions itself independently of the shared dialog positioner, is verified against both failure modes and confirmed unaffected. The outcome is stated in two places, both required: the batch's human-acceptance criteria, and durably in the component's own spec under `.sdd/modules/` — the half that stops the next person re-deriving it, or assuming the surface was affected and changing it. If it turns out to be affected, that is reported, not silently fixed and not silently ignored. |
| REQ-14 | The overlay glass material's standing is untouched: the dialog surface keeps the overlay treatment it has today, the project's enforced blur allow-list gains no selector and loses none, `client/scripts/check-ui-conformance.mjs` is not modified, and it passes. |
| REQ-15 | The correction lives entirely inside the UI library (`client/src/ui/`): no screen, page, panel or feature component acquires any knowledge of dialog sizing, no CSS and no raw markup appears outside the library, and no dialog is compensated for locally. |
| REQ-16 | The corrected behaviour is covered by automated verification that measures the rendered dialog — the card and the content it holds — rather than by screenshot review, so the disagreement cannot be reintroduced by an unrelated change and go unseen. |
| REQ-17 | That automated coverage exercises both directions with content it controls: a long-content case and a deliberately short-content case, the latter being the only way the too-narrow mode is reachable. Coverage that only opens the product's existing long-text dialogs does not satisfy this requirement. |
| REQ-18 | That automated coverage spans every format drawn on the shared dialog surface — the ordinary dialog and the large one — and the viewport-constrained case of REQ-9, rather than spot-checking the instances measured during the investigation. |
