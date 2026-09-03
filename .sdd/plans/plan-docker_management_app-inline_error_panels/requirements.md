---
slug: docker_management_app-inline_error_panels
date: 2026-09-03
spec: .sdd/analysis/docker_management_app-inline_error_panels.md
status: validated
---

# Requirements — Errors leave the page body

Evolution of the delivered product. The reference plan is
[`plan-docker_management_app`](../../archived/plans/plan-docker_management_app/requirements.md) and it
is not re-opened. Ids are local to this plan: `REQ-1` here is **not**
`plan-docker_management_app/REQ-1`.

Vocabulary used below, taken from the spec:

- **error panel** — a block drawn inside a screen's body that reports a failure. This is what the
  human calls an "inline panel".
- **header report** — the connection indicator at the top right of the shell, with its retry control.
- **toast** — the existing notification component, used as it stands.

REQ-13 was added after the requirements were validated, so it sits last in F2 rather than in numeric
order: ids are never renumbered.

## F1 — The page body stops reporting errors

| ID | Requirement |
| --- | --- |
| REQ-1 | No screen of the application shows an error panel in its body, including the panels that report a failure the header report says nothing about. One panel survives, in a form and not in the body: the daemon's refusal of a creation the operator just submitted, shown beside the control that submitted it. |
| REQ-2 | The lost connection is not reported in the page body in any form: no panel, no banner, no row, no inline message. |
| REQ-3 | A screen that loaded no data shows its own empty state, saying the data could not be loaded. That empty state states no cause and carries no control, and its wording is the same whatever the cause, the lost connection included. |
| REQ-4 | For a failure other than the lost connection, the operator retries with the screen's existing manual refresh, without leaving the screen. |

## F2 — Every other failure is a toast

| ID | Requirement |
| --- | --- |
| REQ-5 | A failure that is not the lost connection is reported as a toast, in the failure tone the toast component already has. |
| REQ-6 | Every repetition of a failure raises a new toast, a repetition of the same message included. When a new toast would exceed the cap of three, the oldest visible toast is removed to make room for it. |
| REQ-7 | A toast reporting a failure carries no action button. |
| REQ-8 | The toast component keeps its current tones, its cap of three visible toasts and its auto-dismiss. The cap and the timer do not change; what REQ-6 adds is which toast leaves when the cap is reached. |
| REQ-13 | A failure caused by the lost connection raises no toast. The header report is the only place it is told. |

## F3 — The header is the only report of the connection

| ID | Requirement |
| --- | --- |
| REQ-9 | The header report names which side is unreachable, with these two wordings: `Server unreachable` when the application server cannot be reached, `Docker daemon unreachable` when the application server answers and the daemon does not. |
| REQ-10 | The header report is visible on every screen and at every supported window width, the phone breakpoint included. |
| REQ-11 | The header keeps a control that retries the connection, without the operator leaving the screen. |
| REQ-12 | When the connection comes back, the screen the operator is on shows its data again, without navigating away and back. |

## Out of scope

Taken from the spec, listed so no requirement above is read as covering it:

- Field-level validation messages on form controls.
- The daemon's answer to a command the operator submitted, shown beside the control that submitted
  it. REQ-1 names the one panel this keeps. A transfer that fails while it runs is not this case: it
  is a toast under REQ-5.
- How the connection is detected and retried: the reconnection and polling behaviour does not change.
