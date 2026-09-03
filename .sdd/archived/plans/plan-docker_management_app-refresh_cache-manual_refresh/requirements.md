---
slug: docker_management_app-refresh_cache-manual_refresh
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache-manual_refresh.md
status: validated
---

# Requirements — manual refresh

> One control in the top bar. The operator presses it, the server reads every list value it holds
> again, and the screen in front of the operator shows the result. The refresh cache keeps its own
> schedule.

## Feature — A refresh control in the top bar

| ID | Requirement |
|----|-------------|
| REQ-1 | The top bar carries one refresh control, present and operable on every screen of the application. |
| REQ-2 | The control shows that it is working, from the press until the reload ends. |
| REQ-3 | When the reload ends the control leaves the working state, and a short confirmation tells the operator that the reload ran; the confirmation says nothing about what changed. |
| REQ-4 | Pressing the control while a reload runs starts no second reload. |
| REQ-5 | When the reload fails, a failure message tells the operator that the reload did not succeed, and the control returns to rest with no failed state left on it. |
| REQ-6 | The control stays operable after a failed reload, so the operator can ask again. |

## Feature — The server reads every held value again on request

| ID | Requirement |
|----|-------------|
| REQ-7 | On the operator's request, the server reads again from the daemon every value the refresh cache currently holds, whatever kind it is, the connection status included. |
| REQ-8 | A value the server does not currently hold is not read by the request. |
| REQ-9 | When the daemon cannot be reached, the held values keep their last good content; the request reports the failure instead. |
| REQ-10 | The request changes nothing in the refresh cache's own behaviour: after it, each value keeps the schedule, the period and the event triggers it had before. |

## Feature — The current screen shows the reloaded data

| ID | Requirement |
|----|-------------|
| REQ-11 | When the reload ends, the current screen shows the reloaded data, with no further action from the operator. |
| REQ-12 | A detail view open at that moment shows reloaded data too. |
| REQ-13 | The reload replaces data only: it does not navigate, it does not close what is open, and it does not reset scroll position or selection. |
| REQ-14 | The interface stays usable while the reload runs. |
| REQ-15 | Nothing else in the interface changes: no other control, screen or behaviour is added, moved or altered. |

## Feature — The e2e suite reloads through the control

| ID | Requirement |
|----|-------------|
| REQ-16 | A check that creates a context or a builder from the CLI sees it listed by using the control, instead of waiting out a refresh period. |
