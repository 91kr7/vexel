---
slug: docker_management_app-container_row_actions
date: 2026-08-11
spec: .sdd/analysis/docker_management_app-container_row_actions.md
status: validated
---

# Requirements — Container row actions: three on the row, the rest in an overflow menu

Evolution of the existing product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); the containers list
and its row actions were delivered there, and the reference analysis's demand that destructive
operations be clearly distinguishable and confirmable is what this change is finally paying.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of the reference plan are always
cited with their path prefix.

Visual reference: `bugs-screen/change-1.png`, normative for the arrangement (which actions are
primary, their order, their wording, their tone) and not for pixels. `Duplicate config` appears in
that image, exists nowhere in the product, and is deliberately **not** required — see REQ-6.

One feature, one batch. The menu affordance is an interface-wide asset and its obligations are
stated as such (REQ-10 to REQ-17), but it has no observable behaviour until something opens it, so
it is delivered and accepted through its first consumer, the containers row.

## F1 — Container row actions: three on the row, the rest in an overflow menu

| ID | Requirement |
| --- | --- |
| REQ-1 | The action area at the end of a container row holds exactly four controls — three lifecycle actions and, last, one control that opens a menu — and no other action-bearing control appears anywhere on the row. |
| REQ-2 | The three lifecycle slots are fixed in number, order and position on every row and in every container state: the first carries the state-appropriate run/halt action (`Stop` for a running container, `Start` for a stopped one, `Resume` for a paused one), the second `Pause`, the third `Restart`. |
| REQ-3 | An action that is not legal for the container's current state occupies its slot, visibly disabled, instead of being removed — so a given position means the same action on every row of the list, and keeps meaning it when the container's state changes under the pointer. |
| REQ-4 | Why a disabled row action is unavailable is discoverable from the interface: an operator can tell "not now, because this container is stopped" from "this control is broken". |
| REQ-5 | Every row carries the menu control, in the same final position, in every state; it is never the control that moves. |
| REQ-6 | The menu of a container row lists exactly four entries, in this order: `Rename…`, `Export filesystem…`, `Kill`, `Remove` — and nothing else. No `Duplicate config`: it is in the target screenshot only, is not a capability of the product, and is not created here. |
| REQ-7 | `Kill` and `Remove` are shown in the interface's destructive tone and set apart, as a group, from the two entries above them, so the entries an operator must be careful with are identifiable before they are read. |
| REQ-8 | `Kill` and `Remove` carry the technical hints the flat row buttons carried — `SIGKILL` and `rm` respectively — as secondary text alongside their human-readable labels. |
| REQ-9 | The menu's four entries are always present, in the same order, whatever the container's state; an entry that does not apply is shown disabled rather than removed, and why it is unavailable is discoverable in the same way REQ-4 requires of the row. |
| REQ-10 | Every menu entry carries a real text label; no entry is icon-only. |
| REQ-11 | The control that opens the menu reads unmistakably as "there is more here": it is not an unlabelled decoration, it carries an accessible name, and it announces to assistive technology that it opens a menu and whether that menu is currently open. |
| REQ-12 | The menu is fully operable without a pointer, in the conventional way for a control of this kind: the trigger is reachable and activatable from the keyboard, opening moves focus into the menu, the arrow keys move between entries, an entry can be activated, and `Escape` closes it. |
| REQ-13 | The menu closes on any dismissal — choosing an entry, pressing `Escape`, clicking outside it — and focus returns to the control that opened it. |
| REQ-14 | At most one menu is open at a time: opening one row's menu closes any menu already open, and an open menu is unambiguously attached to the row it belongs to. |
| REQ-15 | An open menu is displayed in full wherever its control sits — including on the last rows of a long list and inside a scrolled panel — and is never clipped by the table, the panel or any scroll container between it and the edge of the viewport. |
| REQ-16 | An open menu stays bound to the container it was opened for while the list keeps updating from daemon events: if that container's row changes state, re-sorts or disappears, the menu either stays with that container or closes, and an entry chosen never applies to a container that has taken its place. |
| REQ-17 | The menu is offered by the shared UI library as a generic component that knows nothing of Docker: it takes its entries, their labels, secondary hints, tones, disabled states and handlers from whoever uses it, is exported from the library's public entry point, and can be adopted unchanged by another object list. The containers screen composes it and contributes no markup and no styling of its own. |
| REQ-18 | Renaming a container is initiated only from the row's menu: the pencil control on the name cell is gone, and no other entry point to rename remains on the list. |
| REQ-19 | Exporting a container's filesystem is initiated only from the row's menu: the container detail panel no longer offers it and gains no replacement action in its place — that slot is deliberately left empty. |
| REQ-20 | Every container operation reachable from the list before this change is still reachable after it — start, stop, restart, pause, resume, kill, remove, rename, export filesystem — with none of them reachable from nowhere. |
| REQ-21 | Each of those operations does exactly what it did before: same effect on the daemon, same confirmation, same success and failure feedback, same live update of the row afterwards. |
| REQ-22 | The confirmation in front of `Kill` and `Remove` is unchanged: standing behind a menu is an added step, never a substitute for it. |
| REQ-23 | Every automated check that drove one of the relocated operations still drives it, through its new entry point; none is deleted, skipped or weakened because the control it used to click is gone. |
| REQ-24 | The containers list keeps updating from daemon events at the same rate and with the same fidelity as before, including while a menu is open. |
| REQ-25 | The list's responsiveness does not regress at any list length: the per-row control costs no more than the buttons it replaces, and no per-row surface computes a runtime blur or any other backdrop filter — the single open menu is the only surface of this change entitled to the interface's overlay treatment. |
| REQ-26 | The menu's labels, its destructive tone, its secondary hints and its disabled entries stay legible where it is used — over dense, live-updating data on the glass material — meeting the same documented minimum contrast the rest of the application is held to (`plan-docker_management_app/REQ-4`). |
