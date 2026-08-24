---
request_slug: docker_management_app-toast_feedback
date: 2026-08-24
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> The defect concerns the toast notifications that appear in the bottom-right corner of the
> application (the "popup" the user sees after an action). Implementation:
> `client/src/ui/feedback/Toast.tsx` and the `.ui-toast*` rules in
> `client/src/ui/feedback/feedback.css`.
>
> Evidence — reproduced live on the running application (dev arrangement, Images & layers screen →
> row overflow menu → "Tag…" → confirm; toast reads "Image tagged / vexel-toast-probe:1"), measured
> in the browser with getBoundingClientRect and getComputedStyle:
>
> 1. Wasted space / double padding. The toast is a `Surface` with `padding="md"` (computed padding
>    20px, class `ui-surface--pad-md ui-overlay-glass`), and *inside* it `.ui-toast` adds a second
>    padding of `12px 16px`. Measured boxes: surface 360x106 px; inner `.ui-toast` 318x64 px; title
>    286x19 px; message 286x17 px. So ~40px of actual text sit in a 106px-tall card — about 60% of
>    the surface is empty padding, and the visible text spans roughly a third of the 360px width.
>    The viewport is a fixed `width: min(360px, calc(100vw - var(--space-6) * 2))`, so a two-word
>    toast occupies the same large card as a long one.
> 2. `tone` has no visual effect. `ToastInput` accepts `tone?: 'neutral' | 'success' | 'danger'`,
>    and callers across the feature layer pass it (e.g. `client/src/images/ImagesScreen.tsx` pushes
>    `tone: 'success'`, `client/src/system/SystemScreen.tsx` pushes `tone: 'danger'` on a failed
>    prune, `client/src/images/FilesystemBrowser.tsx` pushes a danger toast for a failed archive).
>    The render never reads `toast.tone` — a failure toast is pixel-identical to a success toast.
>    Business impact: an operator acting on their own Docker daemon cannot tell a failed operation
>    from a successful one.
> 3. No manual dismiss. A toast can only be waited out (5s default); there is no close affordance,
>    and a long message cannot be dismissed early.

(The request is a bug fix, explicitly scoped by the human to correcting this defect. The human is
away and cannot answer questions, so every open point below is settled as a stated assumption with
a justified default.)

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](./docker_management_app.md).

**Starting point.** That analysis specifies a Docker management client for an operator acting on
their own live daemon, where many operations are destructive or irreversible, and it carries the
non-functional requirement that the glass visual language *"must remain usable (readable text,
discernible controls) for extended operational use, not purely decorative"*. It also records
*"design-vs-usability tension"* as a standing risk: heavy translucency reduces legibility in an app
whose value is dense operational information. Toast notifications are the product's only feedback
channel for actions that complete without navigating anywhere — a tag, a prune, an export, a
removal. They exist in the delivered product and work as a mechanism: they appear, they stack (capped
at three), they expire.

**Changes.** No capability is added and none removed. Three delivered behaviours of one shared
component are corrected: the outcome of an operation becomes visually distinguishable, the card is
sized to what it holds, and the operator can close a toast. Which actions raise a toast, what they
say, and what they do is unchanged.

## Summary

The toast notification is oversized relative to its content, does not render the outcome tone its
callers already pass, and cannot be dismissed by the operator. One shared library component, three
defects, one correction.

## Business goal

**The severe defect is the second one, and the analysis says so plainly: the other two are comfort,
this one is correctness of information.** The product exists to act on the operator's real daemon.
When a prune fails, an archive cannot be written, or a tag is rejected, the application already
knows and already says so through a `danger` toast — and then draws it identically to the toast that
says the operation succeeded. The operator's only signal that something did not happen is prose they
may not read in a transient corner card. Believing a destructive or state-changing operation
succeeded when it failed is the most expensive misunderstanding this product can create, and the
reference analysis names destructive-action risk explicitly. The information is being computed,
passed, and thrown away at the last step.

The other two matter for a different and lesser reason. A card in which 60% of the surface is empty
padding, on the product whose stated differentiator against Portainer and Lazydocker is visual
quality, reads as unfinished work — and it does so on a surface that appears after nearly every
action, so it is the element the operator sees most often. And a notification that can only be
waited out takes a decision away from the operator for five seconds at a time on a screen they are
working on.

Fixing all three at once is the right shape of work because they are three symptoms in one component
of the library: the component is opened once, not three times, and any later toast inherits the
correction.

## Requirements

### Functional

- **A toast's outcome is visible without reading it.** `neutral`, `success` and `danger` must be
  immediately and distinctly recognisable from one another at a glance, on the glass material,
  before any word is read.
- **Outcome is not carried by hue alone.** A colour difference is the natural treatment but cannot
  be the only one: a red and a green card of identical shape are the same card to a colour-blind
  operator, and the reference analysis already flags contrast on translucent surfaces as a standing
  risk. Each tone must differ in at least one non-colour respect as well.
- **`tone` remains optional and its absence keeps today's appearance.** A call site that passes no
  tone must render exactly as it does now. This is what makes the change safe across the ~20 feature
  files consuming the API.
- **The public API of `ToastProvider` / `useToast` stays backward compatible.** Every existing call
  site compiles and behaves identically without being edited. No feature file is required to change
  for this fix to land.
- **The operator can dismiss a toast before its timeout**, through a visible, pointer-reachable
  affordance on the toast itself.
- **Dismissing one toast dismisses only that toast.** The others remain, keep their own remaining
  time, and the stack closes up without displacing what is left in a way that makes the operator
  lose track of it.
- **The card is sized to what it holds.** The doubled padding is removed: a toast has one padding,
  taken from the library's spacing tokens. ~40px of text must not sit in a 106px card.
- **A short toast does not occupy the card of a long one.** The 360px figure becomes a maximum
  rather than a fixed width, with the stack aligned to the corner it lives in, so the reported
  symptom — text spanning a third of the card — is corrected rather than half-corrected. See the
  assumption below for the floor this needs, and the risk it carries.

### Non-functional

- **The correction lives entirely inside the UI library** (`client/src/ui/`). No feature code emits
  markup or style as a result of it, and no screen acquires knowledge of toast presentation.
- **Every new value is a token.** Tone colours, the padding, the radius, the size of the dismiss
  affordance and any z-index come from `client/src/ui/tokens.css` by name. No literal is written on
  the spot.
- **The blur allow-list and the conformance check are untouched.** The toast surface keeps its
  overlay glass material through `.ui-overlay-glass` and gains no new blurring selector, no second
  blur value, and no exception comment.
- **The cap of three visible toasts survives the fix.** It is the reason the toast stack is
  admissible on the allow-list at all; a tone variant or a dismiss control must not become a reason
  to relax it.
- **Text stays legible against the tone treatment.** Tinting a translucent surface reduces contrast
  before it adds meaning; the tinted card must be at least as readable as the untinted one is today.
- **The corrected behaviour is verified the way this project requires.** The dismiss affordance is
  exercised with a real pointer at the control's own visible coordinates — never a programmatic
  `click()` — and the size correction is asserted on the surface's measured box, not on its text
  content. Both rules exist in `CLAUDE.md` because coverage that ignored them passed a shipped
  defect twice.

## Assumptions

- **Three symptoms, one component, one cause of scope.** They are corrected together because they
  live in `Toast.tsx` and `.ui-toast*` and would otherwise be opened three times. No claim is made
  that they share a single root cause: the doubled padding, the unread `tone` and the missing
  dismiss are three independent omissions.
- **`neutral` is and stays the default tone**, rendered as the toast is rendered today. Changing the
  default would silently restyle every existing call site that omits `tone`, which is precisely the
  backward-compatibility risk this fix must avoid.
- **The 5s auto-dismiss is unchanged, for every tone.** The request reports no complaint about
  duration, and the dismiss control resolves the half that was reported ("can only be waited out").
  The converse — a failure message that disappears before it is read — is real and is recorded under
  Risks rather than fixed here, because acting on it would widen the request.
- **Width becomes a maximum with a sensible floor.** The human cites the fixed width as part of the
  defect, so leaving it fixed would answer only the vertical half. The default adopted is: shrink to
  content up to today's 360px maximum, with a minimum width low enough to look like a card and not a
  chip, and the stack aligned on the edge nearest the corner so the ragged side faces inward. This
  is a deliberate departure from the decision taken for dialogs in
  [`docker_management_app-dialog_sizing.md`](./docker_management_app-dialog_sizing.md), where width
  is a designed constant — the reasoning there was that dialogs are seen one at a time and compared
  from memory, which does not hold for a transient corner stack.
- **The mockups in `.sdd/analysis/ui-mock/` are the visual target for the tone treatment**, as for
  every other surface in the product. Where they say nothing about toasts, the treatment already
  used elsewhere in the library for success and danger is followed rather than invented.
- **No accessibility or announcement behaviour is being introduced or removed** beyond what the
  visible correction implies. Whatever the toast does today for assistive technology it continues to
  do.
- **Nothing about which actions raise a toast, or what they say, is at fault.** No caller is edited
  to work around the defect; a fix that required editing feature files would be the wrong fix.

## Constraints

- **The UI library is the only place in the client permitted to contain CSS or emit raw markup**, so
  the correction has exactly one legitimate home.
- **Design tokens only** — colours, spacings, radii, font sizes and z-indexes are named, never
  literal.
- **`backdrop-filter` / `filter: blur()` are forbidden outside the documented allow-list**, which is
  enforced by `client/scripts/check-ui-conformance.mjs` and duplicated in `CLAUDE.md`; both must be
  left exactly as they are. The toast is already covered through `.ui-overlay-glass`, and its
  admission to that list is conditional on the cap of three.
- **~20 feature files consume `ToastProvider` / `useToast`.** The public API is effectively frozen
  in the additive direction only.
- **An existing component is extended rather than duplicated.** A second toast component for tones,
  or a near-duplicate surface, is the divergence the single-library rule exists to prevent.

## Market trends

Not researched, by explicit instruction of the human for this bug-scoped analysis. The conventions
at issue — severity-coded notifications and a manual dismiss — are already settled inside the
product's own API (`tone` exists and is passed) and its own reference analysis, so no external
source is needed to justify the correction.

## Risks

- **Tone rendered as colour alone.** The obvious implementation — tint the card red or green — is
  invisible to a colour-blind operator and is measurably weaker on a translucent surface than on an
  opaque one. If this ships as hue-only, the defect is reported fixed while the operator who most
  needs the signal still cannot see it.
- **The tint costs legibility.** Adding colour to glass reduces text contrast. The failure toast
  would then be the least readable toast in the product, which inverts the intent.
- **The dismiss control races the timeout.** A toast that expires while the pointer is travelling to
  its close affordance leaves the click to land on whatever the toast was covering — a row action, a
  menu trigger, a destructive control on a live daemon. This is the one new interaction the fix
  introduces, and it is the one most likely to be shipped unconsidered.
- **The size fix is made in the shared `Surface` rather than in the toast.** Removing the doubled
  padding by changing `padding="md"` at its source, or by editing the shared pad class, would resize
  every overlay surface in the product to fix one of them.
- **A ragged stack.** Letting toasts shrink to content means three stacked toasts of three different
  widths. On the product whose differentiator is visual coherence this can look worse than the
  oversized card it replaces, and it is the assumption above most likely to need reversing on sight.
- **The cap or the allow-list moves as collateral.** Any change to how the toast surface is built
  sits next to an automated rule about that same surface and next to the reason the surface is
  exempt at all.
- **Existing checks assert on today's toast.** e2e specs that locate a toast by its text, its box or
  its position may break, or may keep passing while asserting nothing about the new behaviour.
- **The defect returns unnoticed.** Nothing detects an unread `tone`: the prop was declared, passed
  by three or more screens and dropped at the render for the whole life of the product without
  anything failing. Unless the corrected behaviour is checked, the same silence can absorb the same
  regression.

## Scope

**In scope**

- The toast component of the UI library and its styles — `client/src/ui/feedback/Toast.tsx` and the
  `.ui-toast*` rules in `client/src/ui/feedback/feedback.css`.
- Rendering the three declared tones (`neutral`, `success`, `danger`) distinguishably, by more than
  colour.
- Removing the doubled padding and sizing the card to its content, in both dimensions.
- A manual dismiss affordance that closes one toast without disturbing the others.
- Any token added to `client/src/ui/tokens.css` for the above.
- Verification, with a real pointer for the dismiss control and on measured boxes for the sizing.

**Out of scope**

- Any change to which actions raise a toast, to their wording, or to what they do. No feature file
  is edited.
- Any breaking change to the `ToastProvider` / `useToast` public API, and any new required prop.
- New tones beyond the three already declared; a toast with actions, links or undo; progress or
  persistent notifications; a notification history or centre.
- Changes to the auto-dismiss duration, to pause-on-hover, or to a tone-dependent lifetime.
- The maximum of three visible toasts, the blur allow-list, and the conformance check — all
  unchanged.
- Every other surface of the library: dialogs, sheets, menus, popovers, drawers, panels. The
  measured evidence implicates the toast only.
