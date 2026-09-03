---
request_slug: docker_management_app-containers_card_view-detail_modal
date: 2026-08-26
type: evolution
size: ordinary
reference: .sdd/analysis/docker_management_app-containers_card_view.md
---

## Request

> I want that the containers details (the table that is show clicking on a container card) will be
> showed in a popup instead of the current inline table

## Reference

Evolution of
[`docker_management_app-containers_card_view.md`](docker_management_app-containers_card_view.md),
which replaced the containers table with one card per container, three to a row, and which
**announced this very change**: the card's top-right square control was built *"present and inert by
decision"*, recorded as the control that "will open the container's detail **in a modal**, in a
future intervention that removes the inline detail panel altogether". This request is that
intervention. Two further predecessors bear on it directly:
[`container_detail_close.md`](docker_management_app-container_detail_close.md) removed the panel's
`✕` under a rule the product still holds — **a panel carries a close control exactly when it has no
other way out** — and added `Escape`, arbitrated innermost-first so an exec or attach session never
loses the key; [`dialog_sizing.md`](docker_management_app-dialog_sizing.md) made a dialog's card
the size of its content, width a designed constant and height the variable, naming four large-format
dialogs as the wide-content precedent.

**Starting point.** Selecting a container card opens a tabbed detail — Logs, Stats, Config,
Processes, Inspect, Exec, Attach — inline, spanning the whole row of cards and opening beneath it; at
most one is open; selecting the same card again closes it, as does `Escape`. It carries no close
control.

**Changes:** the detail becomes an overlay dialog instead of an inline expansion; the card's inert
control becomes the **sole** affordance that opens it, the card body ceasing to be clickable at all;
the close control returns on this surface, because the rule above now points the other way; and the
card stops carrying an expanded state. Nothing the detail contains, shows or does changes.

## Summary

The container detail moves out of the card row and onto the product's existing modal dialog surface,
opened from the card's top-right control, with the same tabs and the same content as today.

## Business goal

**The inline expansion was a table's affordance, and the table is gone.** A detail that unfolds under
its row reads correctly when rows are stacked hairlines: the panel is visibly *that row's*, and
nothing else moves. In a three-column grid it lands under a row of three cards, belongs visibly to
none of them, and shoves the rest of the grid down the page. The card view earned its exception on
the argument that a container is an entity rather than a row, and an entity's detail is a place you
go. Portainer and Docker Desktop each give a container a drill-down view of its own with this same
tab set, and neither expands a row in place.

**It is a screenful of content in a screen's leftover space.** The detail holds a live log stream, a
stats view, property tables, a process list, an inspect dump and two interactive terminals. Inline it
competes for height with the list it was opened from; on its own surface it gets the viewport, which
is what a terminal and a log stream need — and the list stops changing height whenever a detail opens
or closes. The cost is real and accepted rather than solved: an overlay covers what it was opened
from (see Risks). It also closes an open decision rather than adding one — every day the card's
control ships inert, it is indistinguishable from a defect.

## Requirements

### Functional

- **The container detail is presented on the product's existing modal dialog surface.** The inline
  expansion on the containers screen is removed, not hidden behind a preference.
- **The detail's content is unchanged.** The same tabs, in the same order, with the same data, the
  same operations, the same confirmations and the same live behaviour. Any observable difference
  beyond where the detail is drawn and how it is opened and closed is a defect of this change.
- **The card's top-right control is the only route into the detail**, and stops being inert: it keeps
  its accessible name and is keyboard-operable. **The card body opens nothing.** The click gesture
  the operator has today is withdrawn deliberately, and with it the card stops presenting itself as
  an interactive surface — no clickable affordance, and no hover or selected treatment implying one.
  The footer's action controls continue to act on the container and never open the detail.
- **The modal carries a close control**, reversing the earlier removal **on this surface and by that
  decision's own rule**: the gesture that opened the detail is now underneath the modal and cannot
  reverse it, so a close control is the only pointer way out and is therefore required. The shared
  panel's without-close variant is not deleted and keeps governing the images panel.
- **The modal is dismissed by the routes every dialog in this product is dismissed by, and invents
  none of its own.** **Exactly one is open at a time**, and opening it neither reorders the list, nor
  scrolls it, nor changes any card's height.
- **The modal states which container it belongs to.** The inline panel's bond to its row was carried
  by proximity and by the row's open state; an overlay has neither, so identity is carried by the
  modal itself, discharging the earlier requirement that the bond be unmistakable.
- **Closing the modal returns the operator's point of interaction to the control that opened it** —
  the intent the earlier analysis named and could not honour, its row not being focusable.
- **The modal resolves itself when its container ceases to exist.** The list is live: a container can
  be removed by the operator, by another client or by the daemon while its detail is open. The modal
  must say what happened rather than sit on stale data or vanish without explanation.
- **Every live stream the detail owns starts and stops with the modal.** The stats stream, the log
  stream and any exec or attach session open when the tab that needs them is shown and close when the
  modal does, by every route out. Nothing may outlive a closed modal.
- **The shared per-container sampling gate is untouched, and an open modal does not close it.** The
  containers screen is still the screen being shown while its modal stands over it, so it is still a
  consumer; wiring the gate to "cards are visible" would idle sampling behind an open modal and blank
  every card on close.

### Non-functional

- **No surface joins the blur allow-list, and none leaves it.** The modal is already an allow-listed
  overlay carrying the single blur token; no edit to the list or to the check may be required.
- **A surface already permitted to blur now renders inside an overlay, and this product has shipped
  that defect once.** The log stream's floating jump-to-live control is allow-listed and will now
  live inside the modal. A blur nested inside a backdrop root renders nothing at all in Chromium —
  exactly what happened to the combobox popup inside a form dialog. It must be verified as still
  blurring, and not repaired by adding anything to the allow-list.
- **The modal is sized by the delivered dialog rules**, as a large-format surface alongside the image
  diff, layer and filesystem browser dialogs: the card is the size of its content, height bounded by
  the viewport, and the content scrolls within it rather than escaping it.
- **The detail must stay usable at 375×812**, where a full-viewport presentation is expected: no tab
  unreachable, no value clipped to nothing, the terminal and log views operable.
- **No leak across repeated open and close**, on many containers, in every state: no orphaned stream,
  no orphaned session, no retained focus trap, no growing listener count.
- **Existing coverage is rewritten, not deleted** — every check that opens the detail by clicking a
  card, and every check proving it is dismissable, both gestures being replaced here.
- **Interactions are driven with a real pointer at the visible control's coordinates, and the checks
  assert geometry** — the modal's viewport box, the list's stability behind it, the card's own box
  before and after — per the project's standing rule and the shipped defect that produced it.
- **Verified in the delivered product against the real daemon**, under the project's test discipline:
  own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon or
  of inherited application state, every spec passing on its own. **English only**; every visual
  element from the UI library, no CSS and no raw markup in feature code.

## Assumptions

- **"Popup" means the product's existing modal dialog surface**, and nothing else: not a browser
  window, not a drawer, not a non-modal floating panel, not a new component. Any other reading puts a
  second dialog idiom into a product whose whole rule is one visual language.
- **"The table" is the tabbed detail panel**, taken from the request's own gloss — *"shown clicking
  on a container card"*; the word is the human's shorthand for the property bands inside it.
- **Containers only. The images detail panel keeps its inline expansion**, confirmed by the human,
  who accepts two detail idioms standing side by side for a while. The precedent is the same: the
  last change to this shared panel treated one consumer and named the other as a follow-up.
- **The card keeps no expanded and no selected state.** It follows from the control being the sole
  route: nothing is disclosed beneath the card and nothing selects it, so either state would refer to
  something that no longer exists. Selection wanted later, for other reasons, is a new decision.
- **No new capability, tab, data or API**, and no change to the metrics, the sampling cadence or the
  liveness gate: this change moves a surface.

## Constraints

- **One visual language, one place.** The modal, its sizing and its material come from
  `client/src/ui/`; the containers screen composes it and states no layout or style of its own. The
  blur allow-list and the conformance check are untouchable, and the single overlay blur token is the
  only legal value on the one surface entitled to it.
- **`Escape` stays exactly where it already is on this screen** — the card's overflow menu, the exec
  and attach sessions, the log control and any inline editor keep the key as they keep it today, and
  the modal takes it from none of them: like every dialog in this product it claims the key and does
  nothing with it, so nothing behind it is dismissed while it stands. A constraint, not a preference:
  a terminal that stops receiving `Escape` is a broken terminal.
- **The certified predecessors stay certified** and are named in the checks rather than assumed: the
  four-slot action contract and its overflow menu, the dialog sizing rules, the sampling gate, and
  the switch that must not drag its surface out of the viewport.
- **The containers list is live and re-reads on every daemon event**, so whatever the modal does it
  does while the list underneath it changes — and the daemon is the operator's own.

## Risks

- **The gesture operators use today stops working, and nothing announces it.** Clicking a card is how
  the detail is opened now; afterwards it does nothing, and the whole route narrows to one small
  control in a corner. Mitigated only by that control's prominence; the cheap reversal is to let the
  card body open the modal again.
- **The operator loses the list while reading the detail.** Watching one container's logs while
  another's state changes is a real operating pattern, and a modal covers the cards the inline panel
  left visible. This is the change's genuine cost.
- **A stream or session survives the close.** The modal's lifecycle ends by three routes, one of them
  a container disappearing; missing one leaves a stream or an exec session running unseen.
- **The nested blur renders nothing**, and the symptom is not an error but a control that merely
  looks wrong inside the modal.
- **Two detail idioms ship at once** — containers in a modal, images inline. Accepted as temporary on
  the same terms as the last split of this panel; the longer it stands, the more it reads as chosen.
- **Checks are deleted rather than rewritten**, every one of them opening or closing the detail by a
  gesture this change replaces — losing, with the suite green, the proof that it still works.

## Scope

**In scope:** presenting the container detail on the product's existing modal dialog surface with its
tabs and content unchanged; removing the inline expansion from the containers screen; making the
card's top-right control live and the sole route in, and withdrawing the card body's own click
gesture and the interactive treatment that went with it; the modal's close control, its focus return,
and its resolution when its container ceases to exist; the modal stating which container it belongs
to; binding every stream and session to the
modal's lifetime; sizing it as a large-format dialog, usable down to 375×812; verifying that the
allow-listed control inside it still blurs; and rewriting the existing coverage against the modal.

**Out of scope:** the images detail panel, which keeps its inline expansion and its close control
until a request reaches it; the shared panel's without-close variant, which stays; the detail's
content, tabs, data, operations, confirmations and the APIs behind them; the card's layout, metrics,
actions and footer; the sampling cadence and its liveness gate; the containers screen's toolbar,
filters, ordering and empty state; the dashboard; and any change to the blur allow-list, the
conformance check or the dialog width the library defines.
