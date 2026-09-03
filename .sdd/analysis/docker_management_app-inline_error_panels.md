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

- Remove every error panel from the page body, on every screen. None survives, the ones reporting a
  failure the header says nothing about included.
- Report the lost connection in the header indicator only. It must not appear in the page body in
  any form.
- Report every other failure as a toast, in the failure tone the toast component already has.
- A failure that repeats must not fill the toast stack with copies of the same message.
- A screen that loaded no data must not present the empty result as a fact. Its own empty state says
  the data could not be loaded, with no cause and no control: an error panel must not return under
  another name.
- Retry stays possible without leaving the screen: the header control for the lost connection, the
  existing manual refresh for everything else. No toast gains a button.
- When the connection comes back, the current screen shows its data again without the operator
  navigating away and back.
- The header report must name what is actually unreachable: an unreachable application server and an
  unreachable Docker daemon are two states, and this is now the only place to tell them apart.

### Non-functional

- The header report stays visible on every screen and at every supported window width, the phone
  breakpoint included. It is now the only report of the connection.
- The toast is used as it stands: no new tone, no action button, and the cap of three visible toasts
  and the auto-dismiss unchanged.

## Scope

**In scope**

- Every error panel in the page body, on every screen of the application.
- How each failure reaches the operator instead, and what a screen shows while it has no data.
- The accuracy and the visibility of the header report, now the single source for the connection.

**Out of scope**

- Field-level validation messages on form controls. They guide input; they are not error panels.
- Feedback for operations the operator started, which is already a toast.
- Reconnection and polling behaviour: how the connection is detected and retried does not change.
