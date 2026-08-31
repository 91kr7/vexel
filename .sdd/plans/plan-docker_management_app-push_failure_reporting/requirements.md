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
| REQ-10 | The check's budget stays above the time the daemon takes to refuse, and raising that budget is never the remedy for a missing failure. *(Amended 2026-08-27, superseded 2026-08-31.)* *(Superseded 2026-08-31: the 2026-08-27 amendment raised the budget to 120s to clear a refusal recorded as arriving at "either 30.1s or 60.2s, one dial attempt or two". The daemon was not of two minds and does not take thirty seconds to refuse anything. The address under test was `localhost:1`, which resolves to `::1` first inside the daemon's own VM, and `[::1]:1` **swallows** the connection rather than refusing it — so every attempt burned an entire dial timeout, `dial tcp [::1]:1: i/o timeout`, and the "slow mode" was two of them. Measured three consecutive pushes each: `localhost:1` 30.14s / 30.10s / 30.09s; `127.0.0.1:1` 0.08s / 0.06s / 0.07s, answering `connect: connection refused`. Both are covered by the same `127.0.0.0/8` entry of the daemon's insecure-registry list, so the registry is treated identically — and a stated refusal is the case this requirement's own first clause is written about, rather than its unreachable neighbour. The checks now push to `127.0.0.1:1` with 15s budgets: still far above the refusal time, with no second mode left to clear. Confirmed end to end — the e2e file fell from 47s to 17s, the API test from ~30s to 79ms.)* |
