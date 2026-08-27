---
module: containers
component: ContainersScreen
type: UI component
---

# ContainersScreen

**Purpose** → the Containers screen: one card per container, each with three fixed lifecycle
controls and an overflow menu holding its secondary actions (rename, export filesystem, kill,
remove), bulk prune and text/state filtering; the card's top-right control opens that container's
detail as a large-format dialog over the screen, and exec/attach are reached through its tabs.

## Contract

- `<ContainersScreen containers loaded error? onRefresh images? imagesLoaded? />` —
  `containers: ContainerSummary[]`, `onRefresh: () => void` re-reads the list (the caller, the
  Shell, owns `useContainers()`); `images?: ImageSummary[]` are the local images the create/run
  form offers as suggestions.

Description:
- A `ScreenToolbar` with a "Run container…" primary action, a "Create from image…" secondary
  action, a "Prune stopped" destructive action and a filters row (a `SearchField` and
  state `FilterChips`: all/running/stopped/paused), above a **grid of cards, three to a row**, with
  the open container's detail drawn as a dialog over the whole screen rather than inside the grid: one
  `ContainerCard` per container matching the current search/filter, separated by one uniform gap and
  by nothing else — no header row, no rules between them, and no single surface around the list. Two
  to a row at ≤1200px and one below the phone breakpoint; the empty/loading state spans the whole
  row.
Shows:
- One card per matching container, whose own arrangement and values are `container-card.md`'s. Every
  value the delivered table row showed is on it — state, name, image reference, its ports, the
  status/uptime sentence, CPU and memory — and it adds NET I/O, the CPU and memory capacities and a
  fill against each. Past three ports the card draws two and a `+n` (`container-card.md`, where the number is a
  measurement of the row's one line); the full set is in the detail panel.
- **Three lifecycle slots, fixed in number, order and position on every card and in every state** —
  the state-appropriate run/halt action, then `Pause`, then `Restart`. An action the state does not
  allow keeps its slot, disabled, stating why. The legality is the one the delivered row already
  offered: nothing became legal here that the product did not allow before.

  | state | slot 1 | slot 2 (`Pause`) | slot 3 (`Restart`) |
  | --- | --- | --- | --- |
  | `running` | `Stop` | enabled | enabled |
  | `paused` | `Resume` | disabled — already paused | enabled |
  | `restarting` | `Stop`, disabled — restarting | disabled — restarting | disabled — restarting |
  | `created` / `exited` / `dead` / `removing` | `Start` | disabled — not running | disabled — not running |

  The first slot is the **affirmative** control where the container is not running (`Start`,
  `Resume`, drawn as the filled one) and a quiet one where it is (`Stop`). That is a weight and only
  a weight: the action in the slot, its position and its legality are unchanged.

- **One overflow control, always the fourth and last**, on every card in every state. Its menu holds
  exactly four entries, always all four, always in this order: `Rename…`, `Export filesystem…`,
  then — set apart as a group and in the destructive tone — `Kill` (hint `SIGKILL`) and `Remove`
  (hint `rm`). There is no `Duplicate config`. `Kill` is enabled for `running`, `paused` and
  `restarting` and disabled elsewhere with its reason; the other three are enabled in every state.
- An empty/loading state in the list's place when there are no matching containers.
Actions:
- Any non-destructive lifecycle action (start, stop, pause, unpause, restart) runs immediately
  through `useProgress().run` and re-reads the list on completion.
- `Kill`, `Remove` and "Prune stopped" go through `useConfirmation().confirm()` first; cancelling
  performs nothing. The menu is a step in front of that confirmation, never a substitute for it, and
  the confirmation, the progress line and the failure message all still read the operation's own
  name (`kill`, `rm`, `stop`, …) rather than the control's label. "Prune stopped" reports the removed
  count and reclaimed space via `useToast()` on success. Any failure reports the daemon's own message
  via `useErrorReporter()`.
- `Rename…` (REQ-21) replaces the card's name with an inline text field (pre-filled with the current
  name); submitting (Enter or the save icon) renames the container and re-reads the list; the cancel
  icon discards the edit. Submitting an unchanged or empty value is a no-op.
- `Export filesystem…` immediately triggers a browser download of the container's current filesystem
  named `<container name>.tar` via `triggerDownload`, and reports a "Download started" toast naming
  the file (REQ-43): the browser owns the download and its own progress from there, so no dialog is
  opened. This is the only place the export is offered; the detail panel no longer offers it.
- "Run container…" and "Create from image…" both open the same `ContainerCreateForm` (REQ-27); the
  first makes "Create and start" the primary commit action, the second "Create only". A created
  container closes the form and the list is re-read; **nothing is selected and no detail opens** —
  with the card's control the sole route in and no selected state left on a card, opening one here
  would be a second route no gesture of the operator's asked for; cancelling changes nothing.
- The search field matches name, image or state (case-insensitive substring); state chips narrow to
  running / stopped (`created`, `exited`, `dead`) / paused (`paused`, `restarting`) / all.
- **The card's top-right control opens that container's detail**, and it is the only route in: the
  card body opens nothing. The detail is presented on the library's dialog surface at its large size
  (`Modal size="large"`), titled with the container's own identity — a `ContainerIdentityHeader`
  handed to the dialog as composed title content, so the header says as much as the card the operator
  just left — carrying the dialog's opt-in close control and asking for the return of the point of
  interaction on dismissal. Its body is a `ContainerDetailPanel`, which declares no chrome and no
  dismissal of its own.
- **The header's values come from the container data the screen already holds** — the summary it
  draws the card from — and from nothing else: a state or a health outcome that changes while the
  dialog is open shows there on the screen's own re-read, without the operator acting, and no request,
  endpoint or sampling cadence is added to make it so.
- **The screen asks for the large format's fluid width** (`fluidWidth`), by name and with no length
  of its own: this detail's property lists arrange themselves by the width of the box they are given,
  and the format's 1100px cap held them at two columns where the inline panel this replaces showed
  four at 1920 and five at 2560 (REQ-18, amended by the human on 2026-08-26 in REQ-4's favour). It is
  the only surface in the product that asks for it.
- **The screen also asks for the large format's stable height** (`stableHeight`), by name and with no
  length of its own: the detail's frame is then the same box before and after a change of tab and
  before and after a reveal inside one, and each tab's content scrolls inside it rather than
  stretching it. Where the bound comes from is the library's decision, not this screen's, so the
  dialog goes on fitting the viewport with its usual margin.
- **Two ways out, and only those two**: the dialog's close control, and a click on the dimmed area
  beside it. `Escape` closes nothing — the dialog claims the key and does nothing with it, so nothing
  on the screen it covers is dismissed behind it either. Either route leaves the point of interaction
  on the control that opened the dialog, or — when that card has gone — on the list region.
- **At most one detail stands at a time**, the screen holding one container id and no more; no route
  presents a second while one is open.
- Opening or closing it **moves nothing on the screen underneath**: the dialog is not a grid item, so
  no card moves or changes height, the grid does not reorder and the list does not scroll.
- **The dialog is bound to its container by id, resolved against the whole list rather than the
  filtered one**: narrowing the cards behind it by search or by state filter is not a dismissal, and
  neither is a list re-read that moves or redraws the cards — same container, same tab, same streams
  still running.
- **A container that leaves the daemon's list does not close the dialog silently: the dialog states
  it, in place.** Where the tabs were it draws the library's one empty-result surface — titled *This
  container no longer exists*, explaining that it was removed while its detail was open, and offering
  the dialog's own dismissal as its resolving action. The panel and its tabs are gone by then, so
  every stream and session the detail owned has ended with them (`container-detail-panel.md`). The
  dialog **keeps its chrome** in that end state — the identity header and the close control — so both
  ways out still work there and nothing strands the operator in it; dismissing it leaves the point of interaction on the list region, the card that opened it
  having left with the container.
- **In that end state the header freezes at the container's last known identity**: the values are the
  ones the list last carried for it — name, state, health outcome, short id — held exactly as they
  were. The header states no new state of its own, so it never contradicts the end state the body
  states, and it never empties out from under the operator either.
- **A recreate is not a disappearance.** After a configuration change recreates the container, the
  dialog follows it onto the new container's id and goes on showing it, on the same tab; until the
  re-read list carries the new container the dialog stands on the summary it already holds, so no
  end state is drawn in between. A running container's `exec`/`attach` sessions
  (plan-docker_management_app/REQ-34, REQ-35) are reached as tabs inside it.

## Rules and invariants

- **The screen is a consumer of the sampled figures and holds the subscription that keeps them
  coming** (`useStatsSubscription`), for as long as it is the screen being shown and the tab is
  visible. **An open detail dialog does not close that gate**: the screen is still the screen being
  shown while the dialog stands over it, so the daemon goes on being sampled at its certified cadence
  and closing the dialog blanks no card. Moving to another section unmounts it and the daemon stops being sampled; coming back
  mounts it again and a sample is taken at once. It is held here rather than in the shell: the shell
  is open on every screen, so a subscription taken there would mean "a browser is open" instead of
  "somebody is being shown these figures".
- **The inline expansion is gone, and with it the placement question it raised.** The detail used to
  be emitted as the next grid item after the owning card, splitting that card's row; the human's
  decision of 2026-08-25 was to leave that uncorrected because the intervention moving the detail
  onto the dialog surface would remove the inline panel and its placement together. It has. No detail
  opens beneath a card or beneath a row of cards, and no preference, flag or gesture brings it back.

- A card's controls disable while that container's own action is in flight, so a second click cannot race
  the first: the three lifecycle buttons and all four menu entries state that another action on the
  container is still running. The overflow control itself stays operable, so that reason can be
  read.
- Every disabled control — button or menu entry — carries the reason it is unavailable, so a greyed
  control is legible as "not now, because…" rather than as broken.
- The card's **footer** and the card's **detail control** are the only clickable areas of a card: the
  card body is not, and carries no hover or selected treatment implying it is (`container-card.md`).
  None of the four footer controls ever opens the detail.
- A menu's entries are bound to the container its card was rendered for, so the list re-reading or
  re-sorting under an open menu can never point an entry at another container; the menu belongs to
  the card's identity (the container id) and goes with it if that container leaves the list.
- The list keeps re-reading from daemon events at its usual rate while a menu is open: nothing is
  paused, throttled or debounced for the menu's benefit.
- This screen contributes no markup and no styling of its own: it composes library components and
  `ContainerCard`, and the four controls are `ActionButtonGroup`s with the trailing `Menu`.
- The list order is the server's — alphabetical by name, total, stable across re-reads — and this
  screen derives none of its own. There is no sort control, no selection column and no bulk
  selection; "Prune stopped" acts on every stopped container at once, with none to drive.
- **Live updates land in place**: a card redraws its numbers and its fills where it stands. No card
  moves, the list does not reorder and no neighbour is disturbed.
- **Three cards to a row, against the mock's one card at full width** — a departure decided by the
  human on the running product on 2026-08-25, on evidence the mock could not supply: at full width
  the three metric columns spread across ~1000px, leaving a void in the middle with `NET I/O` pushed
  to the far right. The metrics are consequently **stacked** on the card rather than laid side by
  side (`container-card.md`), the second half of the same departure.
- **The card's internal arrangement is `containers-refactor-b3.png`'s, from 2026-08-25**, the
  original `containers-refactor.png` standing as the record of what was first asked. This screen
  composes the cards and the grid; which band an element of a card sits in is `container-card.md`'s.
- **The cards of a row are equal in height; rows are not equal to each other.** No minimum height is
  imposed on a card. The alternative — one height for every card on the screen — was put to the human
  and refused: rows that match, at the cost of empty space inside most cards.
- **The metric columns line up within a row, which is what REQ-10 means on a grid.** Every card of a
  row is the same width and its strip places its metrics at the same x, so the values line up
  **across** a row; with the metrics stacked, they also line up down each column of the grid. The
  original "same x on every card down the list" was written for a single column of full-width cards
  and describes the same property, read on the arrangement that now exists.
- **The cards are not virtualised, and that is the accepted cost of the presentation.** `DataTable`
  mounted only the rows near the viewport; a card's height follows its content, which is the one
  case `DataTable` itself declines to virtualise. Recorded in the plan's `batches.md`; what is
  verified instead is measured smoothness at a realistic container count. Three cards to a row
  **reduces** the exposure without removing it — the same container count now mounts across a third
  as many rows — and the ports cap keeps one container's port list from setting a row's height, but
  a card's height still follows its content and nothing here is virtualised.
- "Prune stopped" is disabled when no container is currently stopped.
- **This screen is the one place in the product where an object list draws a surface per object**,
  admitted by name (and by two literal paths) in `check-ui-conformance.mjs` on 2026-08-25. Every
  other object list — images, volumes, networks, compose, registries, contexts, plugins,
  builders, build cache, and the dashboard's own container list — is still a classic table.
  Consequently this screen no longer makes the table claims it used to: the row-height, header and
  column-typography parity with the Images table stopped applying to a screen with no table, and
  what it does still share with it is its **material** — the same surface, hover and selected
  tokens, taken by reference through `Surface` (see `surface.md`).

## Dependencies

- ui-library: ScreenToolbar, SearchField, FilterChips, TextField, Button, IconButton, ErrorBanner,
  EmptyState (in the list's place, and in the dialog's when its container has gone), Row, Stack, Grid
  (as the list's dismissal focus target) and GridSpan, Modal (at `size="large"`, with its fluid
  width, its stable height, its composed title, its close control and its focus return),
  triggerDownload, useToast
- Containers client, Container transfer client, Images client (`ImageSummary`), useStatsSubscription
- ContainerCard, ContainerIdentityHeader, ContainerDetailPanel, ContainerCreateForm
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-23
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-43
- plan-docker_management_app/REQ-109
- plan-docker_management_app-container_row_actions/REQ-1
- plan-docker_management_app-container_row_actions/REQ-2
- plan-docker_management_app-container_row_actions/REQ-3
- plan-docker_management_app-container_row_actions/REQ-4
- plan-docker_management_app-container_row_actions/REQ-5
- plan-docker_management_app-container_row_actions/REQ-6
- plan-docker_management_app-container_row_actions/REQ-7
- plan-docker_management_app-container_row_actions/REQ-8
- plan-docker_management_app-container_row_actions/REQ-9
- plan-docker_management_app-container_row_actions/REQ-14
- plan-docker_management_app-container_row_actions/REQ-16
- plan-docker_management_app-container_row_actions/REQ-18
- plan-docker_management_app-container_row_actions/REQ-20
- plan-docker_management_app-container_row_actions/REQ-21
- plan-docker_management_app-container_row_actions/REQ-22
- plan-docker_management_app-container_row_actions/REQ-24
- plan-docker_management_app-container_row_actions/REQ-25
- plan-docker_management_app-container_detail_close/REQ-3
- plan-docker_management_app-container_detail_close/REQ-4
- plan-docker_management_app-container_detail_close/REQ-12
- plan-docker_management_app-container_detail_close/REQ-15
- plan-docker_management_app-container_detail_close/REQ-16
- plan-docker_management_app-containers_card_view/REQ-1
- plan-docker_management_app-containers_card_view/REQ-15
- plan-docker_management_app-containers_card_view/REQ-17
- plan-docker_management_app-containers_card_view/REQ-21
- plan-docker_management_app-containers_card_view/REQ-23
- plan-docker_management_app-containers_card_view/REQ-24
- plan-docker_management_app-containers_card_view/REQ-25
- plan-docker_management_app-containers_card_view/REQ-26
- plan-docker_management_app-containers_card_view/REQ-27
- plan-docker_management_app-containers_card_view/REQ-31
- plan-docker_management_app-containers_card_view/REQ-32
- plan-docker_management_app-containers_card_view/REQ-33
- plan-docker_management_app-containers_card_view/REQ-36
- plan-docker_management_app-containers_card_view/REQ-42
- plan-docker_management_app-containers_card_view/REQ-48
- plan-docker_management_app-containers_card_view-detail_modal/REQ-1
- plan-docker_management_app-containers_card_view-detail_modal/REQ-2
- plan-docker_management_app-containers_card_view-detail_modal/REQ-3
- plan-docker_management_app-containers_card_view-detail_modal/REQ-5
- plan-docker_management_app-containers_card_view-detail_modal/REQ-11
- plan-docker_management_app-containers_card_view-detail_modal/REQ-12
- plan-docker_management_app-containers_card_view-detail_modal/REQ-13
- plan-docker_management_app-containers_card_view-detail_modal/REQ-15
- plan-docker_management_app-containers_card_view-detail_modal/REQ-16
- plan-docker_management_app-containers_card_view-detail_modal/REQ-17
- plan-docker_management_app-containers_card_view-detail_modal/REQ-18
- plan-docker_management_app-containers_card_view-detail_modal/REQ-22
- plan-docker_management_app-containers_card_view-detail_modal/REQ-26
- plan-docker_management_app-containers_card_view-detail_modal/REQ-30
- plan-docker_management_app-containers_card_view-detail_modal/REQ-31
- plan-docker_management_app-containers_card_view-detail_modal/REQ-32
- plan-docker_management_app-containers_card_view-detail_modal/REQ-33
- plan-docker_management_app-containers_card_view-detail_modal/REQ-34
- plan-docker_management_app-containers_card_view-detail_modal/REQ-35
- plan-docker_management_app-containers_card_view-detail_modal/REQ-36
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-1
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-4
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-6
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-8
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-9
