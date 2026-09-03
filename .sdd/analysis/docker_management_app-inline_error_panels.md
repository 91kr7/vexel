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
unreachable" with a "Retry" button. In the page body, two panels headed "Daemon unreachable" and
"Could not load containers" repeat it, each with its own Retry, pushing the content down the page.

## Reference

Evolution of [`docker_management_app.md`](../archived/analysis/docker_management_app.md).

**Starting point.** The product reports a lost connection twice: a status indicator in the shell
header, shown on every screen, and error panels in the page body.

**Changes.** The header indicator becomes the only report of a lost connection.

## Summary

When the connection is lost the same fact is shown up to three times on one screen. Keep the header
report, remove the ones in the page body.

## Requirements

### Functional

- Remove from the page body the panel that reports the connection as lost, on every screen that
  shows one, not only Containers.
- Remove a screen's load-failure panel when the cause is the lost connection.
- Keep the inline error report for a failure the header does not cover, so a screen whose data fails
  while the connection is up still explains itself.
- While the connection is down, a screen that loaded no data must not present an empty result as a
  fact: an empty list must not read as "there is nothing here".
- The header report must name what is actually unreachable. An unreachable application server and an
  unreachable Docker daemon are two different states, and this is now the only place to tell them
  apart.
- Retry stays reachable from the header, and using it reloads the data of the screen the operator is
  on.
- When the connection comes back, the current screen shows its data again without the operator
  navigating away and back.

### Non-functional

- The header report stays visible on every screen and at every supported window width, the phone
  breakpoint included. It is now the only one.

## Assumptions

- "These inline panels" means every panel in the page body that reports the lost connection, on
  every screen. The two in the screenshot are examples, not the list.
- Inline error reporting as a mechanism is not removed. The human's reason is duplication, so what
  goes is what the header already says.

## Scope

**In scope**

- The panels in the page body that report a lost connection, on every screen of the application.
- What each of those screens shows in place of them while the connection is down.
- The accuracy and the visibility of the header report, which becomes the single source.

**Out of scope**

- The header status indicator's position, its visual design and its Retry behaviour, beyond the two
  requirements above.
- Error reporting for failures unrelated to the connection.
- Feedback for operations the operator started.
- Reconnection and polling behaviour: how the connection is detected and retried does not change.
