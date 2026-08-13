---
slug: docker_management_app-toggle_focus_scroll
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-toggle_focus_scroll.md
status: validated
---

# Requirements — A switch does not move the surface it sits on

Fix of the delivered product; bug-2 of the human's `bugs.md`, **reopened**. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md). Ids are local to this
plan: `REQ-1` here is *not* `plan-docker_management_app/REQ-1`.

**One defect, one component.** The switch is a single library control
(`client/src/ui/controls/Toggle.tsx`) consumed by the plugins screen, the container logs view, the
container detail panel and the container create form. The requirements are written about the
control, not about the screens that show it.

**The second deliverable is the verification.** The coverage delivered for this same report —
`client/e2e/container-create-privileged.spec.ts` — passes with the defect active: it activates the
control programmatically and asserts on rendered text length. Requirements REQ-10 to REQ-15 are about
that, and REQ-16 is the only one here that outlives the switch.

## F1 — A switch does not move the surface it sits on

| ID | Requirement |
| --- | --- |
| REQ-1 | Operating a switch with a real pointer leaves the surface it sits on exactly where it was: the dialog, panel or page is at the same viewport position and the same scroll offset after the interaction as before it, and the switch itself is still visible and still under the pointer. Measured today in the "Run a container" sheet: the sheet moves to `y=-1044`, above the top of the viewport. |
| REQ-2 | A switch's hidden control is measured against the switch it belongs to: its rendered position coincides with the visible switch rather than being displaced across the page. Measured today: switch at `y=390`, hidden control at `y=1736` — 1346px apart. |
| REQ-3 | The correction is made once, in the shared switch control inside the UI library, and covers all four consumers — plugins screen, container logs view, container detail panel, container create form. No feature screen carries a local compensation for it. |
| REQ-4 | The switch's function is unchanged: it shows the state selected, and that state reaches the daemon exactly as it does today. Nothing about what a switch means, what is sent, or what the daemon does with it changes. |
| REQ-5 | The switch's appearance, wording, size and placement are unchanged, and the layout around it is undisturbed: nothing newly overlaps, nothing changes what sits above what, nothing shifts among the switch's neighbours. Confirmed by looking at each of the four consumers, not inferred from one. |
| REQ-6 | The switch remains operable from the keyboard — reachable by tab, toggled by the keyboard, visibly focused — and remains announced to assistive technology with its label and its state. A correction that works by removing focusability, by removing the hidden control or by taking it out of the tab order does not satisfy this fix and is refused. |
| REQ-7 | Whether the file picker's hidden control (`.ui-file-picker__input`) displaces its surface is established by driving a **real pointer** at it, in a scrolling surface, under the same conditions as the switch; the measurement — the gap between visible control and hidden control, and the surface's position before and after — is recorded. |
| REQ-8 | Whether the button-with-description's hidden text (`.ui-button-with-description__text`) displaces its surface is established the same way, by real-pointer hit-testing rather than by argument, and its measurement is recorded. That it cannot take focus is a reason to expect it clean, never the evidence that it is. |
| REQ-9 | A sibling shown by REQ-7 or REQ-8 to be defective is corrected in the same way, in the same library, within this fix. A sibling that measures clean is **left untouched** — no edit of any kind — and its measurement is recorded durably in its component spec, so the next reader inherits the measurement instead of re-deriving it. |
| REQ-10 | The automated verification of this path asserts **the surface's position**: the surface's viewport coordinates after the interaction equal those before it, and the control just operated is still within the viewport. A check that asserts the surface is present, or that its content is unchanged, does not satisfy this requirement — that check exists and passes with the defect active. |
| REQ-11 | That verification drives a **real pointer**: an actual click delivered at the control's coordinates, carrying focus and the pointer sequence with it. `HTMLElement.click()`, a dispatched event, or any other programmatic activation does not satisfy this requirement — seven such activations failed to reproduce this defect. |
| REQ-12 | The existing bug-2 coverage, `client/e2e/container-create-privileged.spec.ts`, is rewritten in place to meet REQ-10 and REQ-11 and keeps what it already asserts about the privileged path. It is not deleted and not replaced by a new file that leaves it standing. |
| REQ-13 | Coverage includes at least one switch inside a **scrolling detail panel** as well as the reported dialog. The symptom is spectacular in a dialog and quiet in a panel, and the quiet case is the one that would otherwise go unnoticed. |
| REQ-14 | The strengthened check is **observed failing on the unfixed build**, before the correction is made, and that observation is reported with what failed and by how much. A check never seen red proves only that it passes. |
| REQ-15 | The whole verification obeys the project's test discipline against the real daemon: it creates its own fixtures and removes them, assumes neither an empty daemon nor an inherited application state, and every spec passes when run on its own. |
| REQ-16 | `CLAUDE.md` carries the lesson beside the project's existing non-negotiable rules, in both halves and each with its evidence from this defect: *a check that does not use a real pointer cannot detect a defect that only focus or hit-testing can trigger* (seven programmatic activations found nothing where one real click found it immediately), and *a check that measures content cannot detect a defect that moves position* (1154 characters counted before and after, with the defect active). |
| REQ-17 | The correction lives entirely inside `client/src/ui/`: no CSS, no raw DOM tag and no positioning knowledge appears outside the library as a result of this fix. |
| REQ-18 | The project's performance rule is untouched: no new overlay surface, the enforced blur allow-list gains no selector and loses none, `client/scripts/check-ui-conformance.mjs` is not modified, and it passes. |
| REQ-19 | The module indexes and component specs under `.sdd/modules/` are brought into line with what this fix changes and with what it measured — the switch's corrected behaviour, and each sibling's recorded outcome. |
| REQ-20 | The superseded analysis `.sdd/analysis/docker_management_app-privileged_toggle_verification.md` is **not edited by this fix**; instead the exact sites where its verdict is stated are reported to the human, who applies the supersession notes. |
| REQ-21 | `bugs.md` carries, under bug-2, a **second appended annotation** superseding the first: the defect was reproduced with a real pointer, its cause measured, and it is fixed here, with the record named. The existing annotation and the human's own report stay unaltered to the character — that file is appended to, never edited — so the reader who starts where the defect was reported is not left with "investigated, not reproduced" under a defect that has since been reproduced and fixed. |
