---
batch: manual-refresh
feature: The refresh control, the reload behind it and the screen that shows the result
closed_req: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15
depends: —
---

# Batch — manual refresh

The requirements are in `../requirements.md` and are cited here by id.

The server already holds each list and refreshes it on its own schedule. What is missing is a way for
the operator to say "read it all again now". Three parts: the server reloads what it holds, the screen
re-reads once that is done, and one control drives both and says where it is.

## What this batch builds

- **Manual reload endpoint** — the one route the control calls. It reloads every value the refresh
  cache holds and answers when the reload has ended.
- **Reload signal** — the client-side broadcast every mounted view re-reads on. It ends only when
  every subscribed read has ended, which is what makes "finished" mean "the screen has the data".
- **Refresh control** — the control in the top bar: one press, one reload, and the state of it.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/refresh-cache/refresh-cache.ts` | Add a reload over every registered kind that currently holds a value: each is read again at once, and the operation ends when all those reads have ended. A kind holding nothing is skipped. | REQ-7, REQ-8 | — |
| INT-2 | modify | `server/src/refresh-cache/refresh-cache.ts` | The reload leaves each kind's own schedule alone: no period is restarted, no refresher is started for a kind nobody asks for, and no demand is renewed. Event triggers are untouched. | REQ-10 | INT-1 |
| INT-3 | modify | `server/src/refresh-cache/refresh-cache.ts` | A read that fails during the reload keeps the kind's previous held value, as a failed refresh already does. The reload reports which kinds failed instead of throwing. | REQ-9 | INT-1 |
| INT-4 | create | server, refresh-cache module | The manual reload endpoint, `POST /api/refresh`: runs the reload, answers only when it has ended, and states whether every value was read again or some failed. | REQ-7, REQ-9 | INT-1, INT-3 |
| INT-5 | modify | `server/src/index.ts` | Mount the new route among the other `/api` routers, before the client serving and the JSON 404. | REQ-7 | INT-4 |
| INT-6 | create | client, app-shell module (the data layer's broadcasts, beside the active-context one) | The reload signal: a view subscribes with its own read, one call raises it, and the call ends only when every subscribed read has ended. It carries no data and no Docker vocabulary. | REQ-3, REQ-11 | — |
| INT-7 | modify | `client/src/data/use-containers.ts`, `use-images.ts`, `use-volumes.ts`, `use-networks.ts`, `use-compose-projects.ts` | Subscribe each list read to the reload signal, and return its promise so the signal can wait for it. The poll, the event subscriptions and the hook's public shape do not change, and the read stays in place. | REQ-11, REQ-13 | INT-6 |
| INT-8 | modify | `client/src/data/use-contexts.ts`, `use-builders.ts`, `use-build-cache.ts`, `use-build-cache-usage.ts`, `use-registries.ts`, `use-registry-repositories.ts`, `use-plugins.ts` | The same subscription for the kinds Docker publishes no event for. These are the lists the request is about, so they are the ones to get right. | REQ-11, REQ-13 | INT-6 |
| INT-9 | modify | `client/src/data/use-disk-usage.ts`, `use-system-overview.ts`, `use-daemon-info.ts`, `use-coverage.ts`, `client/src/shell/services/ConnectionStatusService.tsx` | The same subscription for the host readings, the baseline and the connection status, so a press re-reads reachability and the negotiated versions too. | REQ-11, REQ-13 | INT-6 |
| INT-10 | modify | `client/src/data/use-container-detail.ts`, `use-image-inspect.ts`, `use-network-inspect.ts`, `use-volume-inspect.ts`, `use-container-processes.ts` | An open detail view reads its own object again on the signal, its process list included. Its event filter and its object scope stay as they are, and the view is not closed or reset. | REQ-12, REQ-13 | INT-6 |
| INT-11 | modify | `client/src/ui/controls/IconButton.tsx` | Add a busy state, the way `Toggle` already carries one: the control keeps its box, states that it is working, and answers no press while it is. | REQ-2, REQ-4 | — |
| INT-12 | create | client, app-shell module (the shell's top bar) | The refresh control: one press calls the endpoint and then raises the reload signal. It is busy from the press until both have ended, and a press while busy starts nothing. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-11, REQ-12 | INT-4, INT-6, INT-11 |
| INT-13 | modify | client, app-shell module — the refresh control of INT-12 | Report the outcome through the toast service: a short confirmation that the reload ran, or a message that it failed. Either way the control returns to rest and stays operable. | REQ-3, REQ-5, REQ-6 | INT-12 |
| INT-14 | modify | `client/src/shell/Shell.tsx` | Put the control in the page header's actions, so it is present and operable on every screen. Nothing else in the header moves; the invariant saying the header carries no interactive control is replaced by this one. | REQ-1, REQ-15 | INT-12 |
| INT-15 | create | client check tree, e2e | The main path, with a real pointer on the control: an object created from the CLI is listed after one press, an open detail view re-reads, and the screen keeps its scroll position, its selection and what it had open. | REQ-1, REQ-11, REQ-12, REQ-13 | INT-14 |
| INT-16 | create | server check tree, api | The endpoint: it reads again every value the cache holds, skips a kind holding nothing, keeps the held value and reports the failure when a read fails, and leaves every kind's period and refresher as they were. | REQ-7, REQ-8, REQ-9, REQ-10 | INT-5 |
| INT-17 | create | client check tree, unit | The control's states: busy while the call runs, a second press starting no second reload, the confirmation on success, the failure message on failure, and operable again afterwards. | REQ-2, REQ-3, REQ-4, REQ-5, REQ-6 | INT-13 |
| INT-18 | create | client check tree, e2e | While a reload runs the interface still answers — another screen can be opened — and the header shows what it showed before plus the control, with the status pill and the version badge unchanged. | REQ-14, REQ-15 | INT-14 |
| INT-19 | modify | `.sdd/modules/refresh-cache/index.md` and `specs/refresh-cache.md`, `.sdd/modules/app-shell/index.md` and `specs/shell.md`, `.sdd/modules/ui-library/specs/icon-button.md` | Carry the change into the specs and the indexes: the reload operation and its endpoint, the new control and the reload signal with their own specs and index rows, the header's new control, and the busy state. | REQ-1, REQ-7, REQ-11 | INT-14, INT-16 |

**A note on INT-7 to INT-10.** These four rows are an enumeration of the client data hooks, and an
enumeration goes stale. Check it against `client/src/data/` when development starts: every read that
asks the daemon for something a screen shows belongs to one of the rows. A hook left out is a screen
where the press changes nothing, and that looks exactly like a broken control.

## Human acceptance

### Scenario: A context created from the terminal appears after one press

- REQ → REQ-1, REQ-7, REQ-8, REQ-11
- Given → the operator is on the Contexts screen, and a new context has just been created from a terminal
- When → the operator presses the refresh control in the top bar
- Then → the new context is listed, without the operator doing anything else

### Scenario: The control says that the reload ran

- REQ → REQ-2, REQ-3, REQ-4, REQ-15
- Given → the operator is on any screen
- When → the operator presses the refresh control
- Then → the control shows it is working, then returns to rest with a short confirmation that the reload ran
- And → pressing it again while it works starts no second reload

### Scenario: The reload leaves the screen where it was

- REQ → REQ-12, REQ-13
- Given → the operator has scrolled a list, selected a row and opened its detail
- When → the operator presses the refresh control
- Then → the detail is still open on the same object and shows current data, and the list keeps its scroll position and its selection

### Scenario: A failed reload is reported, and can be asked for again

- REQ → REQ-5, REQ-6, REQ-9
- Given → the daemon cannot be reached
- When → the operator presses the refresh control
- Then → a message says the reload did not succeed, the screen still shows the values it had, and the control can be pressed again

### Scenario: The automatic refresh is untouched

- REQ → REQ-10, REQ-14
- Given → the operator has just pressed the refresh control
- When → a container is started from a terminal
- Then → the Containers screen shows it as it did before, with nobody pressing anything
- And → the interface answered normally while the reload was running
