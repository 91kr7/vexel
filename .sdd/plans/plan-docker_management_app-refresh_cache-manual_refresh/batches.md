---
slug: docker_management_app-refresh_cache-manual_refresh
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache-manual_refresh.md
status: validated
---

# Batches — manual refresh

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| manual-refresh | The refresh control, the reload behind it and the screen that shows the result | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15 | — | implemented | A context created from the terminal appears after one press |
| e2e-reload | The e2e suite reloads through the control | REQ-16 | manual-refresh | todo | The context and builder checks pass without waiting out a period |

## What the plan builds

Three new components, all in `manual-refresh` and named in that batch file before its table: the
**manual reload endpoint**, the **reload signal** and the **refresh control**. Everything else is an
existing component that starts to use one of them.

**Execution order.** `manual-refresh` first, then `e2e-reload`. The second rewrites checks that press
the control, so the control has to exist.

**Why the suite is a batch of its own.** The two spec files it rewrites belong to another plan's
coverage (`plan-docker_management_app-refresh_cache`, batch `lists-from-refresh-cache`). Keeping them
apart means the product change is certified by checks of its own, and the migration of those seven
checks is one visible step, in the order the orchestrator stated: this plan, then the seven checks,
then that batch's certification.

## Assumptions and decisions

- **The reload is written over the cache's own registry of kinds, never over a list of kinds.** The
  refresh cache already holds every registered kind in one place, which is how it discards them all
  on a context change. A kind registered later — the volume size, when `volume-sizes-separated` is
  built — is reloaded with nothing to change here. This plan is developed **before** that batch and
  depends on nothing it builds.
- **"Finished" means the current screen already holds the data.** The press waits for the server
  reload, then raises the reload signal, and the signal ends only when every subscribed read has
  ended. This is why the data hooks' read returns its promise: without that, the control would report
  finished while the screen still showed the previous values, which is the first risk the spec names.
- **The screen re-reads through the path a daemon event already uses.** Every hook re-reads in place,
  as it does today when Docker announces a change. That is what keeps scroll, selection and an open
  panel where they are: the reload adds a trigger, not a remount.
- **Two presses cost one read.** The control refuses a second press while it works. A second request
  from another window joins the reads already running, because the cache joins a read in flight
  instead of starting a second one.
- **A value nobody currently asks for is skipped, and the screen is still right.** A kind whose demand
  expired holds nothing, so the reload leaves it alone. The client's own re-read then takes the
  cache's first-request path and reads it fresh.
- **The control is one icon control in the page header**, beside the status pill and the version
  badge. No new toolbar, no second row, no keyboard shortcut.
- **It reverses one invariant of an earlier plan, on purpose.** `Shell` records that on a reachable
  daemon the header carries no interactive control at all
  (`plan-ui-coherence-optimisation/REQ-12`–`REQ-16`). That rule refused controls without a handler and
  second routes to a destination the rail already offers. This one answers a real press and exists
  nowhere else. The shell's spec is updated in the same batch; the earlier plan is not touched.
- **Names.** The button is the **refresh control**, the client broadcast is the **reload signal**, the
  server operation is the **manual reload**. The server component keeps the name it already has, the
  **refresh cache**. "Refresh" is the operator's word from the request; "reload" names what the parts
  behind it do, so the two are not confused.
- **The library is extended, not bypassed.** The working state is a busy state added to `IconButton`,
  the way `Toggle` already carries one. No second icon button is written.
- **The outcome is reported with the product's own toasts.** Success and failure both go through the
  toast service the shell already owns.

## Departures

- **The reload covers every value the refresh cache holds, whatever kind it is.** The spec says "every
  list value it holds". The human decided on 2026-08-28 that it is every value the backend holds in
  cache — the connection status with its negotiated versions included — and that the extra call per
  press is accepted. **The business spec should be corrected** on this point.
- The success confirmation of REQ-3 is also a human decision of 2026-08-28. It sits inside the spec's
  own assumption — the control reports that the reload ran and never what changed — so it is recorded
  here as a decision and not as a departure.

## Coverage check

Every REQ is served by at least one INT. Every INT serves at least one REQ. There is no enabling
intervention. No REQ is split across batches: each closes in the batch that lists it.

Intervention ids restart at `INT-1` in each batch, per the `identifiers.md` convention, so they are
qualified with their batch below.

| REQ | Served by | Closes in |
|-----|-----------|-----------|
| REQ-1 | `batch-manual-refresh/INT-12`, `batch-manual-refresh/INT-14`, `batch-manual-refresh/INT-15` | manual-refresh |
| REQ-2 | `batch-manual-refresh/INT-11`, `batch-manual-refresh/INT-12`, `batch-manual-refresh/INT-17` | manual-refresh |
| REQ-3 | `batch-manual-refresh/INT-6`, `batch-manual-refresh/INT-12`, `batch-manual-refresh/INT-13`, `batch-manual-refresh/INT-17` | manual-refresh |
| REQ-4 | `batch-manual-refresh/INT-11`, `batch-manual-refresh/INT-12`, `batch-manual-refresh/INT-17` | manual-refresh |
| REQ-5 | `batch-manual-refresh/INT-13`, `batch-manual-refresh/INT-17` | manual-refresh |
| REQ-6 | `batch-manual-refresh/INT-13`, `batch-manual-refresh/INT-17` | manual-refresh |
| REQ-7 | `batch-manual-refresh/INT-1`, `batch-manual-refresh/INT-4`, `batch-manual-refresh/INT-5`, `batch-manual-refresh/INT-16`, `batch-manual-refresh/INT-19` | manual-refresh |
| REQ-8 | `batch-manual-refresh/INT-1`, `batch-manual-refresh/INT-16` | manual-refresh |
| REQ-9 | `batch-manual-refresh/INT-3`, `batch-manual-refresh/INT-4`, `batch-manual-refresh/INT-16` | manual-refresh |
| REQ-10 | `batch-manual-refresh/INT-2`, `batch-manual-refresh/INT-16` | manual-refresh |
| REQ-11 | `batch-manual-refresh/INT-6`, `batch-manual-refresh/INT-7`, `batch-manual-refresh/INT-8`, `batch-manual-refresh/INT-9`, `batch-manual-refresh/INT-12`, `batch-manual-refresh/INT-15`, `batch-manual-refresh/INT-19` | manual-refresh |
| REQ-12 | `batch-manual-refresh/INT-10`, `batch-manual-refresh/INT-15` | manual-refresh |
| REQ-13 | `batch-manual-refresh/INT-7`, `batch-manual-refresh/INT-8`, `batch-manual-refresh/INT-9`, `batch-manual-refresh/INT-10`, `batch-manual-refresh/INT-15` | manual-refresh |
| REQ-14 | `batch-manual-refresh/INT-18` | manual-refresh |
| REQ-15 | `batch-manual-refresh/INT-14`, `batch-manual-refresh/INT-18` | manual-refresh |
| REQ-16 | `batch-e2e-reload/INT-1`, `batch-e2e-reload/INT-2`, `batch-e2e-reload/INT-3` | e2e-reload |

**Three notes on this coverage.**

- **REQ-11 is the requirement the plan can fail silently on.** Seven interventions carry it because
  every mounted read has to answer the signal. One hook left out is one screen where the press changes
  nothing, and it looks exactly like a broken control. The hooks are enumerated in
  `batch-manual-refresh`, with a note to check that enumeration against `client/src/data/` when
  development starts, and `batch-manual-refresh/INT-15` walks a screen end to end.
- **REQ-13 is served by how the re-read is done, not by an intervention of its own.** The hooks
  re-read in place. If any of them is made to remount or reset instead, the requirement is lost with
  no check failing anywhere else, so `batch-manual-refresh/INT-15` asserts scroll, selection and the
  open detail after the press.
- **REQ-8 and REQ-10 are invisible on screen** and are held by the server check
  `batch-manual-refresh/INT-16` alone. They are what stops the press from turning into a second
  scheduler.
