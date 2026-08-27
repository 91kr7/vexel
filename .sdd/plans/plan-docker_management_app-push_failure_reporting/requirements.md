---
slug: docker_management_app-push_failure_reporting
date: 2026-08-27
spec: .sdd/analysis/docker_management_app-push_failure_reporting.md
status: validated
---

# Requirements — push failure reporting

## Feature — A refused push reaches the operator

| ID | Requirement |
|----|-------------|
| REQ-1 | When the daemon refuses a push, the refusal is reported as a failure the moment it arrives, carrying the daemon's own message verbatim — the address and the cause it names — rather than a wording of the application's own. |
| REQ-2 | A push whose daemon stream has ended without a stated success is reported as a failure; a success is concluded only from a stated success and never from the absence of an error, so no push is left apparently running once the stream has ended. |
| REQ-3 | The application imposes no deadline of its own on a push: it waits exactly as long as the daemon does, and reports whatever the daemon says when the daemon says it. |
| REQ-4 | The failure is shown where the push's progress is already reported, and stays there until the operator dismisses it. |
| REQ-5 | A push that succeeds behaves exactly as delivered: per-layer progress while it runs, and the same completion at the end. |
| REQ-6 | The same outcome rule holds for a pull, which reports its outcome through the same path as a push: a refused pull is reported as a failure carrying the daemon's message, and a pull is never concluded successful from silence. |

## Feature — A check that can fail

| ID | Requirement |
|----|-------------|
| REQ-7 | Before anything is changed it is established, and recorded in writing, which of the two is broken — the path carrying the outcome from the daemon to the operator, or the check that was watching it — and only what that finding names is changed. |
| REQ-8 | A check drives a refused push through the product's own interface, with a real pointer on the visible controls, watching from before the push starts, and asserts that the failure is shown on screen with the daemon's message in it — never that a stretch of time passed without events. |
| REQ-9 | The check reproduces the refusal without reaching any network, by pushing towards an address that cannot be reached. |
| REQ-10 | The check's budget stays above the time the daemon takes to refuse — the forty-five seconds already granted stand — and raising that budget is never the remedy for a missing failure. |
