---
request_slug: docker_management_app-dialog_sizing
date: 2026-08-12
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> - bug-1
>   image: bugs-screen/bug-1.png
>   the size of the popup is not always correct for the text that must contains! the image
>   bugs-screen/bug-1.png is an example but open the popup that i'll wrote next and analyse them
>   using your browser and screenshot functionality:
>       - containers > prune stopped
>       - swarm > initialize swarm / join swarm
>       - images & layers > import filesystem
>       - volumes > two prune popups
>       - registries > login/logout
>       - builders & cache > creare builder
>       - contexts > create context
>       - plugins > install plugin
>       - system & prune > System prune / prune popups

(Note: "creare" = create — typo preserved above as written, read as intended in this analysis. The
request is scoped to bug-1; bug-2 and bug-3 remain in `bugs.md` and are handled separately.)

## Reference

Fix of the delivered product analysed in [`.sdd/analysis/docker_management_app.md`](./docker_management_app.md).

**Starting point.** That analysis specified a Docker management client whose differentiation rests
on two things at once: complete functional coverage of Docker, and a "liquid glass" visual language
positioned as a market differentiator against utilitarian competitors. It carried two non-functional
requirements this defect touches directly — that the glass aesthetic *"must remain usable (readable
text, discernible controls) for extended operational use, not purely decorative"*, and that
*"destructive operations (remove, prune, kill) must be confirmable and clearly distinguishable in
the interface to prevent accidental data loss"*. The delivered product satisfies the functional side
of every dialog listed in the request: each one opens, collects what it needs and performs its
operation. What is broken is the surface those dialogs are drawn on.

**Changes.** This request adds no capability and removes none. It corrects delivered behaviour: the
visible glass card of a dialog and the content laid out inside it are sized independently of each
other and disagree, so the card is not the size of what it holds. Nothing about which dialogs exist,
what they ask for, or what they do changes.

## Summary

Across the product, a dialog's glass card is not sized to the content it contains — sometimes far
too wide, sometimes too narrow for its own content to fit inside it. This is one defect in one
shared component of the UI library, not eleven separate screen bugs.

## Business goal

**One cause, eleven symptoms — and that is the most useful thing this analysis can say.** The human
listed eleven places across nine screens. Every one of them opens a dialog through the same shared
dialog surface of the UI library, at the same ordinary size. The defect is in that one component.
Fixing it once corrects all eleven, and any dialog added later; fixing eleven screens one at a time
would be the wrong shape of work, would leave the four large dialogs and every future dialog still
broken, and would multiply a single decision into eleven divergent ones — the exact divergence the
project's single-UI-library rule exists to prevent.

Three business reasons this is worth correcting rather than tolerating:

- **It attacks the product's stated differentiator at its most visible point.** The reference
  analysis stakes market positioning on visual quality against competitors that are functionally
  adequate but visually utilitarian. A dialog is the most scrutinised surface in any interface: it
  interrupts the operator, it is the only thing on screen, and it is judged in isolation. A glass
  card that spans the viewport around a narrow column of text is not a subtle flaw — it reads as an
  unfinished product, and it does so at the moment the operator is looking hardest.
- **It degrades destructive-operation confirmations specifically.** Five of the eleven listed
  dialogs are prune or removal confirmations. The worst measured instance is System prune. A
  confirmation dialog is the product's one guard against irreversible data loss, and its authority
  comes from looking deliberate. A confirmation whose surface is visibly wrong undermines the
  operator's confidence in the guarantee at the instant they are asked to authorise deletion.
- **The second failure mode is a functional defect, not a cosmetic one.** When the card comes out
  *narrower* than its content, controls and text are rendered outside the surface meant to contain
  them. That is not "less pretty": it is the reference analysis's requirement for *discernible
  controls* failing literally.

## Requirements

### Functional

- **A dialog's visible surface is exactly the size of the content it holds.** The card and the
  content inside it are one thing to the operator and must be one thing in fact — no empty margin of
  glass beyond the content, and no content extending beyond the glass.
- **The rule holds in both directions, and both must be verified.** A dialog must never be *wider*
  than the content it holds, and never *narrower*. These are two distinct failures of the same
  cause, and a fix demonstrated only against long-text dialogs is **not** a verified fix. The
  too-narrow mode is the one that will be missed, because nobody looks for it: it only appears when
  a dialog's text is short, and the only known instance of it was produced by deliberate experiment,
  not found in the wild.
- **A dialog's width is a designed constant, not a function of its text.** Two dialogs of the same
  kind are the same width whether one holds a single sentence and the other holds a paragraph. What
  varies with content is height. This is the reading of "correct for the text it contains" that the
  product adopts, and it is chosen deliberately over the alternative (a dialog that grows and shrinks
  with its text): the listed dialogs are seen one at a time and compared from memory, so a width that
  moved with the prose would make eleven surfaces that are meant to be one family look like eleven
  unrelated ones.
- **The width the library already defines for an ordinary dialog is unchanged by this request.** The
  defect is the *disagreement between card and content*, not the value either one resolves to. No
  number is fixed as a requirement here: the library remains entitled to retune its dialog width as
  a design decision, and this correction must survive that retuning rather than be satisfied by a
  particular figure. A change that reproduced today's numbers while leaving card and content sized
  independently would satisfy the letter of this request and none of its intent.
- **Every dialog drawn on the shared dialog surface is corrected**, not only the eleven the human
  listed: that includes the four large-format dialogs used by the image diff, layer efficiency,
  layer explorer and filesystem browser views. They are drawn on the same surface and can disagree
  in the same way, and being the largest surfaces in the product makes a disagreement there more
  visible, not less.
- **The separate sheet-style form surface is confirmed unaffected, and that confirmation is
  reported.** It positions itself independently and is not expected to exhibit the defect. The
  requirement on it is verification and an explicit statement of the outcome — not a redesign, and
  not silence.

### Non-functional

- **Visual homogeneity is the point of the fix, not a side effect.** After the correction, all
  ordinary dialogs in the product present as one family: same treatment, same proportions,
  differing only in height according to what they contain.
- **Correctness must hold across viewport sizes**, including narrow ones, where a dialog is
  constrained by the available space rather than by its own designed width. The card must still be
  the size of its content there.
- **The overlay glass material's standing is untouched.** The dialog surface remains an
  overlay-class surface with the treatment it has today, including its place on the project's
  enforced allow-list for that treatment. This correction adds no surface to that allow-list and
  removes none, and must not require any change to the conformance check that enforces it.
- **The correction lives entirely inside the UI library.** It is a defect of a shared component; no
  screen or feature area acquires knowledge of dialog sizing as a result of it.
- **The corrected behaviour must be verifiable across all affected dialogs**, not established by
  spot-checking the two instances that were measured during investigation.

## Assumptions

- **All eleven listed dialogs share one cause.** Established by measurement during investigation,
  not inferred: every listed dialog opens through the same shared dialog surface at the same
  ordinary size. Two instances were measured live at a 1280px viewport — Create context, with a
  1016px card around 480px of content, and System prune, with a 1232px card around 480px of content,
  the card there filling essentially the whole viewport. `bugs-screen/bug-1.png` shows the same
  failure on Create context, with the right half of the card empty.
- **The cause is that the card and the content are sized by two different rules.** The card is sized
  from the widest the content *could* be if its text never wrapped — a hypothetical line that is
  never rendered — while the content itself is separately capped at the ordinary dialog width. The
  two answers differ, and the gap between them is what the operator sees. Proven by experiment:
  replacing the Create context description with a single short word collapsed the card from 1016px
  to 397.5px. Restoring the text restored 1016px.
- **A correction to an earlier statement of this analysis, kept rather than erased.** That
  experiment was first reported as leaving the content 82px *outside* its surface — 398px of glass
  around 480px of content. It does not: the content reading had been taken after the text was
  restored. Measured in the same instant, the card is 397.5px and the content 395.5px, and they
  agree — the content's own `min(480px, 100%)` resolves against the collapsed card and follows it
  down. So on this build **nothing is rendered outside its surface in either direction**, and the
  too-narrow mode is a dialog drawn 397.5px wide where 480px was designed. The defect is therefore
  best stated as one thing rather than two: **a dialog's width is a function of the length of its own
  copy** — too wide when the copy is long, too narrow when it is short. That is what the human
  reported, and it is enough on its own to justify the fix.
- **"Not always correct" is taken at face value, in both directions.** The human's wording is
  precise and is honoured as written: the size is sometimes too big and sometimes too small. An
  understanding of this defect as "dialogs are too wide" would specify half a fix and leave the more
  damaging half in place.
- **No dialog's content, wording or behaviour is at fault.** Nothing in the listed dialogs needs to
  be rewritten, shortened or restructured to make the surface correct. Shortening prose would make
  the symptom smaller on the dialogs treated and would leave the defect intact everywhere else,
  including in translations and in future dialogs.
- **There is no prior analysis or prior work on this defect.** An empty plan stub existed at
  `.sdd/plans/plan-docker_management_app-popup_legibility/`; it contained **no files whatsoever**,
  only an empty `batches/` directory, and it had no git history at all, so nothing was ever
  committed or written into it. No analysis with that slug exists in `.sdd/analysis/`. It was a
  directory created by an interrupted run before that run produced anything: **nothing was
  abandoned, because nothing was ever produced.** This request neither supersedes it nor inherits
  from it, and no claim is made about what it was going to be about — sizing or legibility — because
  there is no evidence either way. The empty directory has since been removed, so that a later
  reader is not left re-asking this question of a folder that answers nothing.

## Constraints

- **The internal UI library is the only place in the client permitted to contain styling**, and the
  only place permitted to emit raw markup. The correction therefore has exactly one legitimate home,
  and feature screens must not be asked to compensate for it locally.
- **The project's rule on runtime blur is enforced by an automated conformance check**, and the
  dialog's overlay surface is a named member of its allow-list. That list and the check are one list
  written in two places; this correction must leave both exactly as they are.
- **The visual target for each screen is the existing mockup set.** The corrected dialogs must match
  the intent recorded there, which shows dialogs as compact cards rather than full-width sheets.
- **The correction must not regress the large-format dialogs**, which carry genuinely wide content
  (diffs, layer trees, filesystem listings) and legitimately need more room than an ordinary dialog.
  Making cards hug their content must not be read as making these narrow.
- **No new dependency, and no change to what any dialog does.** This is a defect in how an existing
  surface is measured, and the operator's workflow through every listed dialog is identical before
  and after.

## Market trends

Relevant, and consulted: dialog sizing is a settled question in mainstream design systems, and the
external guidance decides the one genuinely open product question here — whether a dialog should
grow with its text.

- **A dialog's width is a designed constant; only its height responds to content.** Material Design
  specifies a maximum dialog width and states that on reaching it the dialog *"expands or contracts
  vertically to support content"*, while keeping a minimum distance from the edges of the screen.
  Width is a property of the component, not of the sentence inside it. This is the industry norm the
  product's ordinary dialog already intends, and the defect is a failure to achieve it rather than a
  disagreement with it.
  ([Material Design 3 — Dialogs specs](https://m3.material.io/components/dialogs/specs);
  [Material Design 2 — Dialogs](https://m2.material.io/design/components/dialogs.html))
- **The reason a width cap exists at all is legibility**, which is the sharper argument and the one
  that settles the matter. Established typographic guidance puts comfortable reading at roughly
  45–75 characters per line, and the standing advice is to cap measure rather than let text run the
  full width available. Sizing a card from its longest unwrapped sentence therefore defeats the very
  cap it appears to respect: it produces a surface whose width is dictated by the text the cap was
  introduced to constrain. This matters more here than in a general application, because the
  reference analysis already flags contrast and legibility as the known standing risk of a
  translucent visual language.
  ([Baymard — Readability: The Optimal Line Length](https://baymard.com/blog/line-length-readability);
  [UXPin — Optimal Line Length for Readability](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/))

## Risks

- **Only the visible half gets fixed.** The overwhelming risk. The too-wide mode is what the human
  saw and what any screenshot review will look for; the too-narrow mode appears only with short
  content and has never been observed outside a deliberate experiment. A correction that makes the
  wide dialogs look right and is signed off on that basis leaves a defect in place that puts
  controls outside their own surface — and leaves it in the dialogs least likely to be re-examined,
  since short dialogs look unremarkable at a glance.
- **The eleven listed dialogs are treated as the scope.** If the correction is verified only against
  the human's list, the four large-format dialogs and every dialog added later remain exposed to the
  same cause. The list was a set of examples the human happened to notice, not a boundary.
- **A local workaround instead of a correction.** Compensating on individual screens, or trimming
  the prose of the dialogs that show the symptom worst, would make the reported instances look
  acceptable while leaving the cause untouched — and would put styling decisions into feature code,
  breaking the project's single-source rule to hide a defect rather than fix it.
- **Collateral damage to the large dialogs.** Enforcing "the card is the size of its content" without
  care for the wide-content views could shrink the diff, layer and filesystem surfaces to a width
  their content cannot use, converting a cosmetic defect into a functional one on the product's most
  differentiated screens.
- **Regression pressure on the enforced blur allow-list.** Any change to how the dialog surface is
  constructed sits next to an automated rule about that same surface. A correction that quietly adds
  a selector, or moves the treatment onto a different element, would weaken a deliberately narrow
  guarantee as a side effect of an unrelated fix.
- **Narrow viewports left unverified.** Where a dialog is bounded by the screen rather than by its
  own designed width, the two sizing rules that disagree today could still disagree after a fix
  aimed only at the desktop case.
- **The defect returns unnoticed.** Nothing in the product currently detects the disagreement — it
  reached eleven shipped dialogs and was found by a human looking at a screenshot. Unless the
  corrected behaviour is checked as a matter of routine, the same cause can be reintroduced by an
  unrelated change and go unseen for exactly as long again.

## Scope

**In scope**

- The shared dialog surface of the UI library: the single component through which every dialog in
  the product is drawn.
- All eleven dialogs named in the request — prune stopped containers; initialize swarm and join
  swarm; import filesystem; both volume prune dialogs; registry login and logout; create builder;
  create context; install plugin; system prune and the related prune dialogs — corrected by the one
  change rather than individually.
- The four large-format dialogs (image diff, layer efficiency, layer explorer, filesystem browser),
  which are drawn on the same surface.
- Both failure modes: card too wide, and card too narrow for its own content.
- Verification of the separate sheet-style form surface, with the outcome stated explicitly.
- Behaviour at narrow viewports as well as at desktop widths.

**Out of scope**

- bug-2 and bug-3, which remain in `bugs.md` and are analysed separately.
- Any change to what the listed dialogs ask for, validate or perform; to their wording; or to which
  dialogs exist.
- Any redesign of the sheet-style form surface, of the dialog's visual treatment, of its typography,
  spacing or the glass material itself. Only the disagreement in size is at issue.
- Any change to the dialog width the library already defines, to the blur allow-list, or to the
  conformance check that enforces it.
- Non-dialog surfaces — panels, menus, popovers, toasts, drawers — none of which is implicated by
  the evidence, and none of which the request mentions.
