---
request_slug: docker_management_app-inline_error_panels
date: 2026-09-03
type: evolution
size: narrow
reference: .sdd/archived/analysis/docker_management_app.md
---

## Request

> As you can see, when the Docker demon is unreachable, a lot of messages rendered in a... an inline
> pop up appears in the page. Please remove all all these inline panels because the information that
> the demon is unreachable can be found on top right of the application. So the other panels that
> show the unenrached ball are not useful.

Screenshot supplied: the Containers screen, daemon unreachable. Top right, a red-dot pill "Daemon
unreachable" with a "Retry" button. Below it, two panels repeat the fact, each with its own Retry.

Asked how wide the removal goes, the human set the rule in three parts:

> I would like to remove all the inline panels!
> the error that already exists in the header must not appear!
> all the other errors must be rendered as toast notification

## Reference

Evolution of [`docker_management_app.md`](../archived/analysis/docker_management_app.md).

**Starting point.** The product reports failures with error panels in the page body, and reports a
lost connection twice: with such a panel and with a status indicator in the shell header.

**Changes.** No error panel remains in the page. The lost connection is reported by the header
indicator only. Every other failure becomes a toast.

## Summary

The page body stops reporting errors. The header keeps the connection status, and every other
failure is shown as a toast.

## Requirements

### Functional

- Remove every error panel from the page body, on every screen, including the ones reporting a
  failure the header says nothing about.
- Report the lost connection in the header indicator only: no panel in the page body, and no toast
  either.
- Report every other failure as a toast, in the failure tone the toast component already has. A
  transfer that breaks in flight moves to a toast too; the progress display around it stays.
- Each repetition of a failure raises a new toast. The older ones expire on their own timer, and
  when a fourth would exceed the cap of three the oldest is removed to make room.
- A screen that loaded no data must not present the empty result as a fact. Its own empty state says
  the data could not be loaded, in the same words for every cause, and offers no control: an error
  panel must not return under another name.
- Retry stays possible without leaving the screen: the header control for the lost connection, the
  existing manual refresh for everything else. No toast gains a button.
- When the connection comes back, the screen shows its data again without the operator leaving it.
- The header report names which of the two is down: "Server unreachable" for the application server,
  "Docker daemon unreachable" for the daemon. It is now the only place to tell them apart.

### Non-functional

- The header report stays visible on every screen and at every supported window width, the phone
  breakpoint included. It is now the only report of the connection.
- The toast component is used as it stands: no new tone, no action button, no change to its timer.

## Scope

**In scope**

- Every error panel in the page body, on every screen of the application.
- How each failure reaches the operator instead, and what a screen shows while it has no data.
- The accuracy and the visibility of the header report, now the single source for the connection.

**Out of scope**

- Field-level validation messages on form controls. They guide input; they are not error panels.
- The static refusal a dialog shows beside the control that issued the command. It stays a panel.
- Reconnection and polling behaviour: how the connection is detected and retried does not change.
