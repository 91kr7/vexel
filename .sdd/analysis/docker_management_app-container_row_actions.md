---
request_slug: docker_management_app-container_row_actions
date: 2026-08-11
type: evolution
reference: .sdd/analysis/docker_management_app.md
---

## Request

> - change-1
>     image: bugs-screen/change-1.png
>     I want reorganize the containers action so in the container row only the most used action are
>     visibile as default as shown in the sceenshot.
>     The secondary action must be shown in a submenù!
>     the container rename function and the export filesystem must be moved in the submenù

(Typos preserved as written and read as intended: "submenù" = the overflow menu shown in the
screenshot; "action" = actions. The request arrived as one item in a list of six in `bugs.md`; the
other five are being taken through the workflow separately and are not analysed here.)

The request names a screenshot, `bugs-screen/change-1.png`, as the visual target. What it shows,
read directly:

- A container row whose lifecycle area holds **three** actions — `Stop`, `Pause`, `Restart` — plus a
  fourth, round `…` control at the end.
- The `…` control opened, revealing a menu listing `Rename…`, `Duplicate config`,
  `Export filesystem`, `Kill` (with `SIGKILL` set to the right of it) and `Remove` (with `rm` set to
  the right of it). `Kill` and `Remove` are rendered in the destructive tone; the other three are
  not.
- Rows in other states keep the same four slots in the same positions: a stopped container shows
  `Start` with `Pause` and `Restart` present but dimmed; a paused container shows `Resume` with
  `Pause` dimmed and `Restart` available. Every row ends with the same `…` control.

## Reference

Previous analysis: [`.sdd/analysis/docker_management_app.md`](./docker_management_app.md).
Sibling evolutions of the same analysis:
[`docker_management_app-about_license_notice.md`](./docker_management_app-about_license_notice.md),
[`docker_management_app-single_process_serving.md`](./docker_management_app-single_process_serving.md).

**Starting point.** The reference analysis established Vexel as a single-operator, local-first client
exposing the full functional surface of a Docker installation behind a consistently applied "liquid
glass" interface. Two of its statements bear directly on this change. First, under container
lifecycle management it required the complete set of operations — start, stop, restart,
pause/unpause, kill, remove, **rename** — as first-class capabilities, without saying anything about
how they should be laid out. Second, among its non-functional requirements it demanded that
destructive operations (remove, prune, kill) be "confirmable and clearly distinguishable in the
interface to prevent accidental data loss", and that the glass aesthetic stay legible under extended
operational use. It did not rank the operations by frequency, and it did not decide which of them
belong on a list row.

The interface mockup that accompanied it,
[`.sdd/analysis/ui-mock/containers_1.png`](./ui-mock/containers_1.png), answered that unasked
question by putting all five lifecycle actions flat on every row — `stop`, `pause`, `restart`,
`kill`, `rm` — and the strain is visible in the mockup itself: the five buttons run to the right edge
of the panel and the last row's `rm` is clipped by it. The delivered product follows that mockup.
Rename was never in that group at all: it sits as an unlabelled pencil glyph on the name cell.
Export filesystem sits one level further in, on the container detail panel, reachable only after a
row is expanded.

**Changes:**

- **The row's action area is re-ranked, not re-populated.** Three lifecycle actions stay on the row
  — the state-appropriate start/stop action, pause and restart — and everything else moves behind a
  single overflow control at the end of the row. No operation is added and none is taken away.
- **`Kill` and `Remove` leave the row surface.** The two irreversible operations stop being
  permanently exposed one pointer-width from the ones an operator uses all day, and acquire the
  deliberate extra step the reference analysis's own "clearly distinguishable, confirmable" demand
  was always reaching for.
- **Rename gains a home in the action area and loses the one it had.** The pencil on the name cell
  goes; `Rename…` becomes a menu entry. An operation stops being discoverable only by noticing an
  unlabelled glyph inside a data cell.
- **Export filesystem moves up one level and out of the detail panel.** It becomes a row-menu entry
  and is no longer offered by the detail panel. Since it is the only action that panel carries, the
  panel's action slot is left empty — intended, and stated here so nobody downstream reads the
  emptiness as an omission.
- **The row's geometry becomes fixed.** The four slots hold their positions across every container
  state, with inapplicable actions shown disabled rather than removed, so the columns line up down
  the list and a given position always means the same thing.
- **The interface acquires a menu affordance it does not have today.** This is the first place in the
  product where a control opens a list of commands. It is a product-wide asset from the moment it
  exists, not a containers-screen detail, and the same pattern is already expected on at least one
  other object list (the images screen, handled by a separate request). It is specified here as
  something the interface offers uniformly, and the containers screen is simply its first consumer.
- **Nothing else changes.** No operation changes what it does, no confirmation is relaxed, no new
  Docker capability appears, and the reference analysis's scope, constraints and risks stand
  untouched.

## Summary

Reorganise the containers list so each row shows only the three lifecycle actions an operator uses
routinely, and moves the rest — rename, export filesystem, kill, remove — behind a single overflow
menu at the end of the row, with the two destructive ones marked as such.

## Business goal

**The container row currently presents every operation as equally urgent, and it is not.** Five
buttons sit on every row, in every row, at all times. On a host with twenty containers that is a
hundred controls competing for attention against the data the operator actually came to read — name,
image, CPU, memory, ports, uptime. The reference analysis's stated value is a *complete* client;
completeness delivered as an undifferentiated wall of buttons reads as clutter rather than as power,
and the price is paid on the one screen the operator spends the most time on.

**Frequency is the whole point of the request, and the frequencies are not close.** Stopping,
starting, restarting and pausing are the everyday verbs of running containers locally. `kill` is the
escalation reached for when a stop did not take — occasional by definition, because it exists for the
case where the ordinary path failed. `remove` is terminal. `rename` and `export filesystem` are
occasional-to-rare. Putting the first group on the row and the second behind one deliberate click is
simply making the interface agree with how the tool is used. The screenshot is the human's own
statement of where that line falls, and it is the only usage evidence this product has: the
reference analysis rules out telemetry, so frequency here is judgement, expressed by the target
image, not measurement.

**Two irreversible operations are currently one stray click from the ones used constantly.** `kill`
and `rm` sit immediately beside `restart`, at the end of a row, in a list whose rows shift as
containers come and go and as the list re-sorts. The reference analysis already named destructive
actions as a standing risk of this product and required them to be clearly distinguishable; today
they are distinguished by colour alone, at the exact position a hurried pointer travels to. Moving
them behind an overflow control adds one intentional step in front of an operation that cannot be
undone, and lets them be grouped and toned as the exceptional things they are — without weakening
any existing confirmation, which stays exactly as it is.

**Two capabilities are currently hidden in places nobody would look for them.** Rename lives as a
pencil glyph on the name cell — an unlabelled icon inside a data column, discoverable only by
hovering the right pixel; the reference analysis listed rename as a first-class capability and the
interface delivers it as a rebus. Export filesystem lives on the detail panel, so reaching it costs
an expansion first, and an operator who thinks of it as "something I do to this container" has no
reason to expect it there. After this change there is exactly **one place** to look for everything
that can be done to a container: the action area at the end of its row. One action, one home. That
is worth more than the individual clicks saved or spent, because it removes the question "where is
that again?" entirely.

**A fixed row geometry makes the list safe to act on quickly.** With a variable number of buttons
per row, the control under the pointer changes meaning depending on the state of the row beneath it
— and container state changes on its own, driven by the daemon, while the operator is looking at it.
Four slots that always exist, in always the same order, with inapplicable ones visibly disabled,
means the third slot is `Restart` on every row of the list and stays `Restart` when a container
stops. That is a correctness property dressed as a layout decision.

**It gives the product somewhere to put the next action.** The row is full at five and was already
overflowing in the original mockup. Every future per-container operation — and the reference
analysis's ambition guarantees there will be more — currently has nowhere to go except a sixth
button or another hidden glyph. An overflow menu is the place those land without re-opening this
argument each time. The counterweight, recorded under Risks, is that such a place turns into a junk
drawer if nothing polices it.

**And it is a product-wide asset, not a screen fix.** Vexel lists containers, images, volumes,
networks, stacks, services, contexts, builders, plugins and registries — every one of them a table of
objects with operations attached. All of them face the same problem this request solves, and one of
them (images) is already queued behind it. Building the menu once, in the one place the project
allows visual elements to be defined, means the second screen costs a fraction of the first and
every screen behaves identically. Building it twice would produce exactly the divergence the
project's single-visual-language rule exists to prevent.

## Requirements

### Functional

- **The container row shows at most three lifecycle actions plus one overflow control.** No other
  action-bearing control belongs on the row.
- **The three lifecycle slots are fixed in number, order and position across all rows and all
  states.** The first slot carries the state-appropriate run/halt action (`Stop` for a running
  container, `Start` for a stopped one, `Resume` for a paused one); the second is `Pause`; the third
  is `Restart`.
- **An action that is not legal for a container's current state is shown in place and disabled, not
  removed.** A stopped container still displays `Pause` and `Restart`, inert. This is what keeps the
  columns aligned down the list and what stops a control changing meaning under the pointer when a
  container's state changes.
- **Why an action is unavailable must be discoverable** rather than left as an unexplained grey
  control — an operator must be able to tell "not now, because it is stopped" from "broken".
- **Every row carries the overflow control, in the same final position, in every state.** It is never
  the thing that moves.
- **The overflow menu lists, in this order:** `Rename…`, `Export filesystem…`, `Kill`, `Remove`.
  (`Duplicate config` appears in the target screenshot and is deliberately **not** required — see
  Assumptions and Scope.)
- **`Kill` and `Remove` are visually marked as destructive and set apart from the entries above
  them**, so the group an operator must be careful with is identifiable before it is read.
- **`Kill` and `Remove` keep the short technical hint the flat buttons carried in their labels** —
  `SIGKILL` and `rm` respectively — presented as secondary text alongside the human-readable label.
  The operator who learned this product by its CLI-shaped labels must still be able to map the entry
  to the command it performs.
- **The menu's entry list is stable in shape.** An entry that does not apply to the container's
  current state is shown disabled, for the same reason the row's slots are: a menu whose items move
  between openings cannot be used quickly, and an item that vanishes is indistinguishable from a
  capability the product does not have.
- **Rename is initiated only from the menu.** The pencil control on the name cell is removed. The
  entry's trailing ellipsis signals that the operation asks for input before it happens; *where* that
  input is taken is a later-phase decision, not a requirement here.
- **Export filesystem is initiated only from the row's menu.** The container detail panel no longer
  offers it, and gains no replacement action. (This analysis says nothing about anything else on that
  panel.)
- **Every operation reachable today stays reachable, and behaves identically.** Same effect, same
  confirmation, same success and failure feedback, same live update of the row afterwards. Any
  observable difference in what an action *does* is a defect of this change, not a consequence of
  it.
- **Confirmation of destructive operations is unchanged.** Being behind a menu is an additional step,
  never a substitute for the confirmation the reference analysis requires.
- **At most one row's menu is open at a time**, and it is unambiguously attached to the row it
  belongs to. Opening another row's menu closes the first.
- **The menu closes on dismissal** — choosing an entry, pressing escape, clicking away, or otherwise
  leaving it — and returns the operator where they were.
- **An open menu is always fully readable**, including for the last rows of a long list and inside a
  scrolled panel. A menu clipped by the edge of the table is a hidden capability, which is the exact
  problem this change exists to solve.
- **The menu is operable without a pointer.** Every entry is reachable and activatable by keyboard,
  in the conventional way for such a control, and every entry carries a real text label — no
  icon-only entries.
- **A row whose menu is open must not act on the wrong container.** The list updates live from daemon
  events, so rows can change state, appear, disappear and re-sort while a menu is open; the menu must
  remain bound to the container it was opened for, or close, and must never apply an action to a
  container that has taken its place.

### Non-functional

- **No regression in the list's live behaviour.** The reference analysis made near-real-time state a
  standing requirement. Rows must keep updating from daemon events at the same rate and with the same
  fidelity while the new control exists and while a menu is open.
- **No regression in the list's responsiveness, at any list length.** A control repeated on every row
  must cost per-row as close to nothing as the buttons it replaces; the standing project rule that
  the main view pays nothing for the glass material applies here without exception, and the menu
  surface — of which at most one exists at a time — is the only part of this change entitled to an
  overlay treatment.
- **Legibility over the glass material.** The menu is a translucent surface over dense, moving
  operational data; its labels, its destructive tone and its disabled states must all remain readable
  in that condition, per the reference analysis's accessibility-of-the-aesthetic requirement.
- **Discoverability must not regress on balance.** Four operations become one step further away. That
  is the accepted trade, but the overflow control must read unmistakably as "there is more here" —
  an operator who does not find `Remove` after this change has been handed a worse product, not a
  tidier one.
- **The change is verified in the delivered product**, against the operator's real daemon, under the
  project's existing testing discipline: a test creates and destroys its own fixtures, asserts on
  what it created rather than on totals or emptiness, and assumes nothing about the daemon's or the
  application's prior state.
- **Existing automated checks that drive these actions are updated deliberately, not silently.**
  Rewriting a check to reach an action through the menu is legitimate; quietly dropping a check
  because its button is gone would hide precisely the loss of reachability this change must not
  cause.
- **English only**, per the project's language convention.

## Assumptions

- **This is an evolution of the reference analysis, not a fix and not a new product.** Stated by the
  human, and consistent with the finding that nothing is broken: the row does exactly what the
  original mockup specified, and this request restates how those actions should be presented. It
  follows the precedent of the sibling evolutions listed above.
- **The screenshot is normative for the arrangement, not for pixels.** It decides which actions are
  primary, which are secondary, their order, their wording and their tone. It is a mock, so exact
  measurements, colours and spacing are the later phases' business, bounded by the interface's
  existing design tokens.
- **"Most used" is the split the screenshot draws**, and there is no other source for it. The product
  collects no usage telemetry (the reference analysis records no such requirement and positions the
  product as local-first), so action frequency is the requester's operational judgement, and it is
  accepted as given.
- **`Duplicate config` is not part of this change.** It appears in the target screenshot but no such
  capability exists anywhere in the product today — not on the row, not on the detail panel, nowhere
  — and this request reorganises actions that exist rather than adding one. Verified before writing.
  Recorded explicitly, and repeated under Scope, so that nobody downstream reads it off the image and
  builds a new capability out of a mockup.
- **The dimmed `Pause` and `Restart` in the screenshot's stopped and paused rows mean "present and
  disabled", not "absent".** They occupy their slots and hold the columns in line; the alternative
  reading — that the row simply has fewer buttons in those states — would reproduce the shifting
  geometry this change is meant to remove, and would not explain why the dimmed controls are drawn at
  all.
- **The row's labels take their human-readable form** (`Stop`, `Start`, `Resume`, `Pause`,
  `Restart`) rather than the lowercase CLI form of the original mockup (`stop`, `unpause`, `rm`), and
  `Resume` is the wording for un-pausing. This is what the target screenshot shows, and the CLI
  vocabulary is preserved where it carries real information — as the `SIGKILL` and `rm` hints on the
  two destructive entries.
- **Rename keeps whatever editing mechanism serves it best**, inline or otherwise; only its entry
  point is decided here. The trailing ellipsis is read as the conventional signal that further input
  is required, which is true either way.
- **The detail panel's now-empty action slot is intended.** Export filesystem is the only action it
  carries, so moving it empties the slot. Nothing else about that panel is specified here; a separate
  request deals with it.
- **No selection, no bulk actions.** Nothing in the request or the screenshot implies acting on
  several containers at once, and introducing it would be a materially larger change with its own
  destructive-action questions.
- **The overflow menu will be reused beyond this screen.** At least one other object list is already
  queued for the same treatment, and every list in the product has the same shape of problem. This
  analysis therefore treats the menu as an interface-wide affordance whose first consumer is the
  containers screen; it specifies nothing about any other screen, which remains that request's
  business.
- **Standard menu behaviour is assumed rather than invented.** Keyboard operation, focus handling and
  dismissal follow the established convention for a control of this kind; the requirement above
  states the obligation, not a bespoke interaction model.
- **Nothing about the product's data, API or Docker behaviour changes.** This is a presentation
  change to operations that already exist and already work.

## Constraints

- **Product constraint — one visual language, defined in exactly one place.** The project's
  non-negotiable rule (`CLAUDE.md`) is that every visual element comes from the internal UI library
  (`client/src/ui/`) and that feature code composes it and nothing else. The product has no menu,
  popover or dropdown affordance today, so this change cannot begin in the containers screen: the
  affordance must exist as a generic, domain-agnostic part of the library first, and only then be
  used. Inlining it "just here, for now" is precisely the divergence the rule forbids, and would
  guarantee two incompatible menus by the time the second screen needs one.
- **Product constraint — the main view pays nothing for the glass.** The project holds a standing,
  enforced rule that background blur is never computed at runtime by the main view, with a short,
  deliberately maintained allow-list of overlay surfaces and a single permitted blur value. A menu
  that opens over the list is a candidate for that list only because at most one is ever open; a
  control that exists on every row is not, and no per-row surface may acquire an overlay treatment.
  Joining the allow-list is an explicit product decision taken with the change, not a side effect of
  it.
- **Product constraint — destructive operations stay confirmable.** From the reference analysis.
  Relocating `Kill` and `Remove` into a menu adds friction in front of them; it removes nothing from
  behind them.
- **Domain constraint — container state governs which transitions are legal**, and the daemon is the
  authority on it. The row can only reflect legality, never define it, and the state can change
  between the moment a menu is opened and the moment an entry is chosen — a race the domain imposes
  and this change must survive gracefully rather than pretend away.
- **Domain constraint — `kill` and `remove` are irreversible** and affect a daemon shared with
  everything else running on the operator's machine.
- **Repository constraint — the suite runs against the operator's own daemon.** Any verification of
  this change obeys the project's test rules: own fixtures, full cleanup, no assumption of an empty
  daemon, no state inherited from another test, every spec passing on its own.
- **Convention constraint — English only**, kebab-case package/folder naming, commands run from the
  repository root.

## Market trends

Relevant, and researched: the reference analysis positions this product against named competitors in
a live category, and "how a table row exposes its actions" is a settled convention in that category
rather than an open design question — so the request can be checked against prevailing practice
instead of taste.

- **Grouping row actions behind a trailing overflow ("kebab") control is the standard enterprise
  data-table pattern**, and the stated reason is exactly the one behind this request: a table with
  three buttons on each of fifty rows puts a hundred and fifty controls on screen and drowns the data
  the table exists to show. The accompanying rule is the same split the screenshot draws — keep an
  action permanently visible when it is the one taken on almost every visit, and group the rest.
  ([UX Design World, Actions in Data Tables](https://uxdworld.com/best-practices-for-providing-actions-in-data-tables/);
  [Pencil & Paper, enterprise data tables](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables);
  [Setproduct, data table UI reference 2026](https://www.setproduct.com/blog/data-table-ui-design))
- **Destructive entries belong in a menu, separated from the rest of it.** Current guidance is
  explicit that placing deactivate/delete/remove in a distinct group inside a drop-down reduces
  accidental selection, that destructive actions should carry deliberate friction rather than sit
  where a fast pointer lands, and that they need both a distinguishing tone and a confirmation
  proportional to what is lost. That is precisely what moving `Kill` and `Remove` off the row
  achieves, and it validates keeping the existing confirmations rather than treating the menu as a
  replacement for them.
  ([UX Design World, destructive actions in drop-down menus](https://uxdworld.com/design-tip-14-drop-down-menu/);
  [Design Systems Collective, handling destructive actions](https://www.designsystemscollective.com/designing-better-buttons-how-to-handle-destructive-actions-d7c55eef6bdf);
  [SSW Rules, destructive button UI](https://www.ssw.com.au/rules/destructive-button-ui-ux))
- **The documented pitfall of the pattern is discoverability**, not clutter: when actions migrate
  into an overflow, users need an unmistakable cue that they went somewhere. This is why the
  requirement above insists the overflow control read as "there is more here" and why the trade is
  stated as a trade.
  ([Eleken, table design UX](https://www.eleken.co/blog-posts/table-design-ux))
- **Portainer — the closest functional competitor named in the reference analysis — presents
  container operations as a small set of quick actions (start, stop, restart, remove) on its
  containers view**, with the deeper capabilities (logs, inspect, stats, console, attach) reached
  from the container itself rather than crowded onto the row. The industry norm this app is compared
  against is therefore already "a few actions on the row, the rest one level in", which is what this
  change adopts.
  ([Portainer docs, container view](https://github.com/portainer/portainer-docs/blob/2.39/user/docker/containers/view.md))
- **Menus are one of the affordances browsers give nothing for free**, and the established
  expectations are specific: the control announces that it opens a menu and whether it is open, the
  menu is a single stop in tab order with arrow keys moving between entries, and escape closes it.
  This is the basis for assuming conventional behaviour rather than designing it, and for requiring
  labelled entries over icons.
  ([W3C WAI-ARIA APG, menu button pattern](https://w3.org/WAI/ARIA/apg/patterns/menu-button);
  [W3C WAI-ARIA APG, menu and menubar](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/))

## Risks

- **The frequency split is wrong for some operators.** `kill` is more common in local development
  than its "escalation" framing suggests — containers that ignore a stop signal are routine — and an
  operator who reaches for it often now pays two steps every time. The split is the requester's
  call and is accepted; the risk is that it is judged from one person's habits with no measurement
  behind it, and it is the first thing to revisit if the menu is being opened constantly for the same
  entry.
- **The menu acts on the wrong container.** The list is live: rows change state, appear, vanish and
  re-order under an open menu. An entry chosen a moment after the underlying row changed identity
  would apply `Remove` to something the operator never selected — the worst possible failure of a
  change whose stated purpose is protecting destructive operations. This is the sharpest risk here
  and the one least likely to be noticed in casual use.
- **The overflow becomes a junk drawer.** Once a place exists for "everything else", every future
  action goes there by default and the menu grows into a list nobody can scan — reproducing at one
  remove exactly the clutter this change removes from the row. Each addition needs the same
  frequency argument the original five got.
- **Discoverability lost, not just relocated.** Four operations move behind a control that must be
  clicked to reveal them. Rename in particular trades an always-visible (if unlabelled) glyph for a
  labelled entry two steps in; export filesystem loses the place an operator may already have learned
  it. There is no migration hint telling anyone where things went.
- **Silent capability loss.** With the detail panel's only action removed and four row buttons gone,
  it is entirely possible to ship a version where one of these operations is reachable from nowhere
  at all. Nothing about the layout would look wrong; the capability would simply be gone.
- **The menu is clipped or mispositioned.** Inside a scrolled table, near the bottom of a long list,
  or over the detail panel, a menu that opens where it cannot be fully read hides the very entries
  this change moved into it.
- **Performance regression on the list.** Adding a per-row control to a long, live-updating, scrolled
  table is exactly the situation the project's standing performance rule exists to protect. A menu
  surface treated as if it were cheap, or an overlay treatment applied per row rather than to the one
  open menu, would degrade the screen the product is used on most.
- **Accidental activation from muscle memory.** An operator who has learned that "far right of the
  row" means `rm` will find, after this change, that the same travel opens a menu — and that inside
  it, `Remove` is a short distance further. The mitigation is the destructive grouping and the
  retained confirmations; the risk is real for the first weeks regardless.
- **Keyboard and assistive-technology regression.** The buttons being replaced are trivially
  reachable by their nature. A menu is only as reachable as it is deliberately built to be, and
  getting that wrong turns a tidier interface into an inaccessible one — against the reference
  analysis's requirement that the aesthetic stay usable for extended operational work.
- **Divergence with the next screen.** If the images screen re-implements the pattern instead of
  reusing it, the product ends up with two menus that look and behave almost alike — the precise
  failure the single-library rule exists to prevent, and one that is far cheaper to avoid now than to
  reconcile later.
- **`Duplicate config` gets built by accident.** It is in the target screenshot, it is not in the
  product, and it is not in this request. A downstream reader working from the image alone would add
  a capability nobody asked for, with its own semantics to invent.

## Scope

**In scope:** the containers list row's action area — reducing it to the state-appropriate
start/stop action, `Pause`, `Restart` and a single overflow control, in fixed positions across all
container states, with inapplicable actions visible and disabled; an overflow menu on every row
containing `Rename…`, `Export filesystem…`, `Kill` and `Remove`, with the last two marked as
destructive, grouped apart, and carrying their `SIGKILL` and `rm` hints; the removal of the rename
pencil from the name cell, rename becoming a menu-initiated operation; the removal of export
filesystem from the container detail panel, leaving that panel's action slot empty; the addition of a
generic, domain-agnostic menu affordance to the interface's shared UI library as the prerequisite for
all of the above, built so that the other object lists can reuse it unchanged; correct behaviour of
an open menu against a live-updating list; keyboard operability and legibility of the menu over the
glass material; and updating the product's automated verification so that every operation stays
demonstrably reachable through its new entry point.

**Out of scope** (unless a future request extends it): `Duplicate config` — it appears in the target
screenshot but does not exist in the product, and this change reorganises existing actions rather
than adding capabilities; any change to what an action does, to its confirmation, to its feedback or
to the API behind it; the same reorganisation on any other screen — images, volumes, networks,
Compose, Swarm and the rest keep their current arrangement until asked for separately, even though
they are expected to reuse the affordance built here; anything else about the container detail panel,
including its close affordance, which belongs to a separate request; multi-select or bulk actions on
containers; new per-container operations of any kind; changes to the containers list's columns,
sorting, filtering, expansion behaviour or the screen's top-level toolbar; keyboard shortcuts for
container actions outside the menu itself; and any redesign of the liquid-glass material beyond what
the new menu surface requires.
