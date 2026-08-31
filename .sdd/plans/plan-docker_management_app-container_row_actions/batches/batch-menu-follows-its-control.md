---
batch: 2 · menu-follows-its-control
feature: F2 — An open menu follows its control instead of closing on any scroll
closed_req: [REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33]
depends: []
---

# Batch 2 — an open menu follows its control

**The operator presses `…` on a container card and nothing appears.** The menu opens and closes
again a moment later, under their own hand.

The requirements are in [`../requirements.md`](../requirements.md) and are cited here by id. The
evidence — the three checks that failed on 2026-08-31 and what their traces hold — is in that file's
appended section and is not repeated.

## What happens, in order

1. the press reaches the trigger and the menu opens (the traces time that action at about 50 ms);
2. a `scroll` event is delivered by some container of the page — the card region, which scrolls
   (`.ui-frame__content`, `overflow-y: auto`, `client/src/ui/layout/layout.css:74`);
3. `Menu.tsx:138` is listening for `scroll` **in the capture phase**, on `window`, so it receives that
   event whatever produced it and wherever it came from;
4. anything not inside the popup closes the menu. The press has already happened, so the operator sees
   a menu that never appeared.

**The Containers screen produces those events on its own.** The list is read again every three seconds
and on every daemon event; the grid's height changes as a container is born, dies or changes state;
and a control near the bottom is brought into view before it can be pressed — which is a scroll whose
event is delivered *after* the press it made possible. Nothing here requires an operator to scroll.

**The images screen shares the component** — the same overflow slot of `ActionButtonGroup`, on a table
instead of a card grid — so it has the same defect and is repaired by the same change, with no
intervention of its own.

## The correction

**A menu that follows its trigger does not float free, so it does not have to close.** The rule stated
today in `.sdd/modules/ui-library/specs/menu.md` — "a scroll anywhere between the trigger and the
viewport, or a resize, closes it" — protects against a popup left standing where its trigger no longer
is. The protection is right; closing is the wrong price for it. On a scroll the popup is **repositioned
against the trigger**, and the menu closes only when the trigger is genuinely gone.

**Repositioning is affordable because most of it is already written.** The popup is `position: fixed`
and portalled onto `document.body`, outside every scrolling ancestor
(`.ui-menu__popup`, `client/src/ui/controls/controls.css:505`), so it is placed in viewport
coordinates and nothing between it and the edge of the screen moves it. The component already
recomputes that placement against the trigger's box **after every render** and bails out when the box
has not moved (`Menu.tsx:110`), which is what keeps the list updating under an open menu. A scroll
produces no render — that, and only that, is why the listener exists. So the scroll path calls the
same placement routine, and the state it writes lives inside `Menu`: the list underneath re-renders
nothing (REQ-31).

**"Gone" is not a rectangle against the viewport.** A trigger scrolled out of the card region can still
have a box inside the viewport, because it is the region that clips it, not the screen. So the
condition is the trigger's *visible* area once every clipping ancestor has had its say — an
intersection observation against the viewport is the cheap primitive for it, since that is exactly what
it computes; the mechanism is the implementer's, the condition is not.

Three decisions inside that, each with what it costs:

- **Entirely out, not partly out.** A threshold on partial clipping puts back a hair trigger that
  differs from today's only in how many pixels of scroll it takes. The cost is accepted and named: while
  a card is half under the header, its open popup is drawn overlapping the header. That lasts as long as
  the operator keeps scrolling, and the alternative is the defect again, one degree weaker.
- **A resize still closes the menu.** Not minimalism for its own sake: a resize is always a deliberate
  gesture, never something the list does under the operator three times a second, and it changes every
  geometry at once — including which layout the frame is in, since the navigation rail docks and
  undocks at the phone breakpoint. Closing a transient overlay there is conventional and costs nothing.
  The unit case at `client/test/unit/menu.test.tsx:430` therefore stays exactly as it is, and so does
  the one at `:440` — an unmounted trigger still takes its popup with it.
- **Focus is still not pulled back on the close.** The reason survives the change intact: a close
  caused by the trigger leaving the visible area, answered by focusing that trigger, would scroll it
  back against the operator's own scroll.

## The second hypothesis, and why it is closed by a check rather than by a change

Opening moves focus onto the first entry with a bare `focus()` (`Menu.tsx:73`), and focus on a partly
visible element makes a browser scroll it into view — the shape of the `bug-2` defect `CLAUDE.md`
records. **It is excluded as the cause and no source behaviour changes for it**, for three reasons:
the popup is `fixed` with its top clamped to zero and its left clamped inside the viewport, so there is
nothing a browser could scroll to reveal it; a blanket `preventScroll` would be a regression of its own,
stranding the last entry outside view when a menu reaches `--menu-max-height` and `End` or a wrapping
`ArrowUp` has to bring it into the list's own scrolled box; and after this batch a scroll caused by
focus cannot close a menu anyway.

An argument is cheaper to write than to trust, so REQ-30 turns it into an observation: opening a menu
moves nothing. If that check ever goes red, the repair is `preventScroll` on the **opening** focus
alone — entry zero, which never needs the list scrolled — and nowhere else in the keyboard model.

## The retry helper: its reason narrows, it does not vanish

`client/e2e/support/row-overflow-menu.ts` retries the whole open-and-choose gesture because the menu
can be dismissed between the two halves, and names the scroll dismissal as the contract it is written
against. After this batch that sentence is false, and a retry whose stated cause has been repaired is
how the next regression of it passes unnoticed.

It is **not** deleted. One dismissal outlives this change — the trigger's own row replaced or dropped
under the gesture — and the helper's second half, which refuses to press an already-activated
destructive entry a second time, was never about scrolling at all. What changes is what the retry is
allowed to absorb: **a menu gone while its trigger is still present, at the same box, is the repaired
defect and must fail the check**, named as such, instead of being tried again. A trigger that has
moved or gone is the case that still deserves another attempt.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/controls/Menu.tsx`, the scroll listener registered while the menu is open | A scroll repositions the popup against the trigger, through the same placement routine the render-time effect uses, instead of closing the menu. Still registered only while a menu is open, and it re-renders nothing outside the menu. | REQ-27, REQ-28, REQ-31 | — |
| INT-2 | modify | `client/src/ui/controls/Menu.tsx`, the closing condition beside that listener | The menu closes when the trigger is entirely out of the visible area left to it by whatever clips it — not from its rectangle against the viewport, which cannot see an intervening scroll container's clip. An unmounted trigger still takes the popup with it, and a resize still closes. | REQ-29 | INT-1 |
| INT-3 | modify | `client/src/ui/controls/Menu.tsx`, the focus the open path gives the first entry | Behaviour unchanged. State on the spot that opening must scroll nothing, and why a blanket `preventScroll` is refused: it would strand the last entry when a menu reaches its height cap. INT-9 is what makes the claim falsifiable. | REQ-30 | — |
| INT-4 | modify | `.sdd/modules/ui-library/specs/menu.md`, "Rules and invariants" | Rewrite the invariant that any scroll closes it: an open menu follows its trigger through a scroll, and closes when the trigger has left the visible area or been unmounted. Keep the resize close and the withheld focus return, with the reason each still holds. The component's row in `.sdd/modules/ui-library/index.md` describes it correctly as it stands and is left alone. | REQ-27, REQ-28, REQ-29 | INT-1, INT-2 |
| INT-5 | modify | `client/test/unit/menu.test.tsx:418`, "closes on a scroll without pulling the focus back" | The case asserts the defect, so it is rewritten against the new contract, not deleted: a scroll that leaves the trigger where it is keeps the menu open, and the popup's placement follows the trigger's box. The two cases beside it are untouched. | REQ-27, REQ-28 | INT-1 |
| INT-6 | create | client check tree, unit, beside the menu's dismissal cases | The cost guard: with every menu closed no scroll handling is registered at all, and with one open a scroll redraws the menu and nothing around it. | REQ-31 | INT-1 |
| INT-7 | create | client check tree, end-to-end, containers area | The operator wheels the card region, the control staying in view: the menu is still open, and the popup's box and the trigger's box are read before and after with their offset unchanged. | REQ-27, REQ-28, REQ-32 | INT-1 |
| INT-8 | create | client check tree, end-to-end, containers area | The same region wheeled far enough to take the control out of it: the menu is gone. | REQ-29, REQ-32 | INT-2 |
| INT-9 | create | client check tree, end-to-end, containers area | The region's scroll offset and the page's, read before the press and again with the menu open: neither has moved. | REQ-30, REQ-32 | INT-3 |
| INT-10 | modify | `client/e2e/support/row-overflow-menu.ts` | The header states the cause that still exists — the row replaced under the gesture — and no longer the repaired one. An attempt that finds the menu gone while the trigger is still present, at the same box, ends the gesture and names it instead of retrying. The refusal to press an entry twice is untouched. | REQ-33 | INT-1, INT-2 |
| INT-11 | modify | `client/e2e/containers.spec.ts`, the three cases that failed on 2026-08-31 | Left exactly as written — no wait, no retry, no softened assertion, no longer budget. They go green on the repaired product, which is the whole of what they have to report. | REQ-27, REQ-32, REQ-33 | INT-1 |

## Order

`INT-1` → `INT-2` → `INT-4`, `INT-5`, `INT-6`, `INT-7`, `INT-8`, `INT-10`, `INT-11`; `INT-3` → `INT-9`,
independently of the rest. The source first: a check written against a contract the component does not
yet honour is a red run with nothing to read in it.

## How the checks are made able to fail

**INT-7 is the one that fails on the product as it stands** (REQ-32). A wheel event over the card region
closes today's menu outright, so the assertion that it is still open goes red before the change and the
geometry assertion never gets to run. It is the check this batch exists for.

**INT-8 and INT-9 pass before the change as well, and that is what they are for.** Everything closes
today, so "closes when the control has gone" cannot fail on the unrepaired product; it is the guard
against the repair overshooting into a popup that never closes. INT-9 likewise fails today only if the
second hypothesis was real. Both are stated here so that a green run of them is not read as proof of
anything about the defect.

**A real scroll, from the wheel** (`page.mouse.wheel`, with the pointer over the region), never a
programmed `scrollBy`: what is under examination is the reaction to an operator's own scrolling, and a
scripted scroll offset is a different event with different timing. Every press is a real pointer at the
visible control's coordinates — never `element.click()`, never a dispatched event.

**Position, not content.** A popup left standing where its trigger no longer is keeps every entry and
every character it had; what it loses is its coordinates. So INT-7 reads the popup's and the trigger's
boxes before and after the scroll and asserts the offset between them, and reads each of them **once
the layout has stopped moving** — the suite's own settle helpers — because a box read from a layout in
motion belongs to another frame.

**The region has to be scrollable without the operator's own containers.** A machine's daemon holds
whatever it holds, and no check here may assert on totals, counts or a list being empty. So the case
makes its own cards — enough of them, from an image the run's preliminary step already guarantees, and
a viewport short enough that the card region scrolls with them — and asserts only on the fixture it
opened the menu on. Every fixture is removed with `docker rm -fv` in a `finally`, ownership labels
carried, and each case passes when its file is run on its own.

## Out of this batch

The overflow menu's contents, its entries, its keyboard model, its material and its clipping — all
certified in batch 1 and untouched here. The `Combobox` popup, which positions itself inside its own
field and has no scroll dismissal of any kind. Any change to the containers screen, its cards, its list
refresh rate or the images table. Any widening of `CLAUDE.md`'s blur allow-list: this batch adds no
surface, no selector and no blur value, and `client/scripts/check-ui-conformance.mjs` is not edited. No
server code, no endpoint, no Docker call.

## Human acceptance

**REQ-31, REQ-32 and REQ-33 carry no scenario of their own, deliberately.** REQ-31 is a cost an
operator cannot see except as the absence of a stutter; REQ-32 and REQ-33 are constraints on the checks,
not on the product. INT-6, INT-7 and INT-10 are what prove them.

### Scenario: The menu stays open while the list keeps moving underneath it

- REQ → REQ-27
- Given → the Containers screen, with containers starting and stopping so the list is read again and
  the grid changes height
- When → the operator presses `…` on a container's card
- Then → the menu opens and stays open, with its four entries, instead of vanishing an instant later

### Scenario: The menu follows the card as the operator scrolls

- REQ → REQ-27, REQ-28
- Given → an open `…` menu on a card, in a list long enough to scroll
- When → the operator scrolls the cards with the wheel, keeping that card in view
- Then → the menu stays open and stays against its own control, moving with the card rather than
  standing where it was opened

### Scenario: The menu closes when its card is scrolled away

- REQ → REQ-29
- Given → the same open menu
- When → the operator keeps scrolling until that card is no longer visible at all
- Then → the menu is gone, rather than floating over the cards that have taken its place

### Scenario: Opening a menu moves nothing

- REQ → REQ-30
- Given → the Containers screen, scrolled to any position
- When → the operator presses `…` on a card
- Then → the cards stay exactly where they were, and the menu opens at its own control
